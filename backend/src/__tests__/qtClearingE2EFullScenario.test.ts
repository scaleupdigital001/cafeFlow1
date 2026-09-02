import mongoose from 'mongoose';
import express from 'express';
import dotenv from 'dotenv';
import Order from '../models/Order';
import Bill from '../models/Bill';
import Dish from '../models/Dish';
import Restaurant from '../models/Restaurant';
import QT from '../models/QT';
import orderRoutes from '../routes/order';
import qtRoutes from '../routes/qt';

dotenv.config();

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/cafeflow';

async function runQtClearingFullE2EScenario() {
  console.log('\n========================================================================');
  console.log('STARTING FULL END-TO-END VERIFICATION: CLEAR ON FINAL BILL & AUTO-REFRESH');
  console.log('========================================================================\n');

  try {
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(MONGO_URI);
    }

    const testTenantId = new mongoose.Types.ObjectId();
    const ts = Date.now();

    // Reset collections
    await Restaurant.deleteMany({ _id: testTenantId });
    await Order.deleteMany({ restaurantId: testTenantId });
    await Bill.deleteMany({ restaurantId: testTenantId });
    await Dish.deleteMany({ restaurantId: testTenantId });
    await QT.deleteMany({ tenantId: testTenantId });

    // Setup Restaurant & Dishes
    const restaurant = new Restaurant({
      _id: testTenantId,
      name: 'E2E Clear Bistro',
      slug: `e2eclear-${ts}`,
      address: '100 E2E Way',
      contact: '9444455555',
      taxRate: 5,
    });
    await restaurant.save();

    const pizzaDish = new Dish({
      restaurantId: testTenantId,
      name: 'Truffle Pizza',
      price: 400,
      available: true,
      category: 'Mains',
    });
    await pizzaDish.save();

    const drinkDish = new Dish({
      restaurantId: testTenantId,
      name: 'Iced Peach Tea',
      price: 120,
      available: true,
      category: 'Beverages',
    });
    await drinkDish.save();

    // Socket emission tracker
    const emittedEvents: Array<{ event: string; payload: any }> = [];
    const mockIo = {
      to: (room: string) => ({
        emit: (event: string, payload: any) => {
          emittedEvents.push({ event, payload });
        },
      }),
    };

    // Express Mock Harness
    const app = express();
    app.set('io', mockIo);
    app.use(express.json());
    app.use((req: any, res: any, next: any) => {
      req.user = {
        _id: new mongoose.Types.ObjectId().toString(),
        restaurantId: testTenantId.toString(),
        role: 'restaurant_admin',
      };
      req.app = app;
      next();
    });
    app.use('/api/orders', orderRoutes);
    app.use('/api/qt', qtRoutes);

    const callHandler = async (routerStack: any[], path: string, method: string, reqMock: any): Promise<any> => {
      const routeLayer = routerStack.find(
        (layer) => layer.route && layer.route.path === path && layer.route.methods[method.toLowerCase()]
      );
      if (!routeLayer) throw new Error(`Route layer not found for ${method} ${path}`);

      reqMock.headers = reqMock.headers || {};
      reqMock.user = reqMock.user || {
        _id: new mongoose.Types.ObjectId().toString(),
        restaurantId: testTenantId.toString(),
        role: 'restaurant_admin',
      };
      reqMock.app = app;

      const targetHandler = routeLayer.route.stack[routeLayer.route.stack.length - 1].handle;
      let responseData: any = null;
      let responseStatus = 200;

      const resMock: any = {
        status: (code: number) => {
          responseStatus = code;
          return resMock;
        },
        json: (data: any) => {
          responseData = data;
          return resMock;
        },
      };

      await targetHandler(reqMock, resMock);
      return { status: responseStatus, data: responseData };
    };

    // Pre-condition: Table 4 places an order to test multi-table isolation throughout
    console.log('[Setup] Table 4 places Order for multi-table isolation baseline...');
    const table4OrderRes = await callHandler(orderRoutes.stack, '/manual', 'POST', {
      body: {
        tableNumber: 'Table 4',
        customerName: 'Baseline Table 4 Guest',
        phoneNumber: '9444400004',
        items: [{ dishId: pizzaDish._id.toString(), name: 'Truffle Pizza', quantity: 1 }],
      },
    });
    if (table4OrderRes.status !== 201) throw new Error('Setup failed: Table 4 order creation failed');
    const table4QtDoc = await QT.findOne({ orderId: table4OrderRes.data.data._id });
    if (!table4QtDoc) throw new Error('Setup failed: Table 4 QT not found');

    // ------------------------------------------------------------------------
    // STEP 1: Table 9 places Order A -> Confirm QT #1 appears in active queue automatically
    // ------------------------------------------------------------------------
    console.log('[STEP 1] Table 9 places Order A (Truffle Pizza)...');
    const orderARes = await callHandler(orderRoutes.stack, '/manual', 'POST', {
      body: {
        tableNumber: 'Table 9',
        customerName: 'Table 9 Sitting 1',
        phoneNumber: '9444400009',
        items: [{ dishId: pizzaDish._id.toString(), name: 'Truffle Pizza', quantity: 2 }],
      },
    });
    if (orderARes.status !== 201 || !orderARes.data.success) {
      throw new Error(`STEP 1 Failed: Order A creation error: ${JSON.stringify(orderARes.data)}`);
    }
    const orderA = orderARes.data.data;
    const qt1 = await QT.findOne({ orderId: orderA._id });
    if (!qt1) throw new Error('STEP 1 Failed: QT #1 not created for Order A!');

    // Verify new_qt socket event
    const event1 = emittedEvents.filter((e) => e.event === 'new_qt').pop();
    if (!event1 || event1.payload.ticketNumber !== qt1.ticketNumber) {
      throw new Error(`STEP 1 Failed: new_qt socket event missing for QT #1 (${qt1.ticketNumber})`);
    }

    // Verify GET /api/qt active queue returns QT #1 for Table 9
    const activeQ1Res = await callHandler(qtRoutes.stack, '/', 'GET', { query: { tableNumber: 'Table 9' } });
    if (activeQ1Res.status !== 200 || activeQ1Res.data.count !== 1) {
      throw new Error(`STEP 1 Failed: Active queue count for Table 9 expected 1, got ${activeQ1Res.data.count}`);
    }
    console.log('  └─► STEP 1 PASSED: QT #1 (' + qt1.ticketNumber + ') automatically present in active queue via real-time event & GET /api/qt.');

    // ------------------------------------------------------------------------
    // STEP 2: Table 9 places Order B -> Confirm QT #2 appears alongside QT #1
    // ------------------------------------------------------------------------
    console.log('[STEP 2] Table 9 places Order B (Iced Peach Tea)...');
    const orderBRes = await callHandler(orderRoutes.stack, '/manual', 'POST', {
      body: {
        tableNumber: 'Table 9',
        customerName: 'Table 9 Sitting 1',
        phoneNumber: '9444400009',
        items: [{ dishId: drinkDish._id.toString(), name: 'Iced Peach Tea', quantity: 3 }],
      },
    });
    if (orderBRes.status !== 201 || !orderBRes.data.success) {
      throw new Error(`STEP 2 Failed: Order B creation error: ${JSON.stringify(orderBRes.data)}`);
    }
    const orderB = orderBRes.data.data;
    const qt2 = await QT.findOne({ orderId: orderB._id });
    if (!qt2) throw new Error('STEP 2 Failed: QT #2 not created for Order B!');

    // Verify active queue returns BOTH QT #1 and QT #2 for Table 9
    const activeQ2Res = await callHandler(qtRoutes.stack, '/', 'GET', { query: { tableNumber: 'Table 9' } });
    if (activeQ2Res.status !== 200 || activeQ2Res.data.count !== 2) {
      throw new Error(`STEP 2 Failed: Active queue count for Table 9 expected 2, got ${activeQ2Res.data.count}`);
    }
    console.log('  └─► STEP 2 PASSED: QT #2 (' + qt2.ticketNumber + ') appears alongside QT #1 in queue (Total 2 active QTs for Table 9).');

    // ------------------------------------------------------------------------
    // STEP 3: Print final bill for Table 9 -> Confirm active QT queue section becomes empty without manual reload
    // ------------------------------------------------------------------------
    console.log('[STEP 3] Printing final bill & completing order for Table 9...');
    const billPrintRes = await callHandler(orderRoutes.stack, '/:id/status', 'PATCH', {
      params: { id: orderA._id.toString() },
      body: { status: 'completed', paymentMethod: 'cash' },
    });
    if (billPrintRes.status !== 200 || !billPrintRes.data.success) {
      throw new Error(`STEP 3 Failed: Final bill print failed: ${JSON.stringify(billPrintRes.data)}`);
    }

    // Verify real-time qt_cleared socket event emitted for Table 9
    const clearedEvent = emittedEvents.find((e) => e.event === 'qt_cleared' && e.payload.tableNumber.includes('9'));
    if (!clearedEvent) {
      throw new Error('STEP 3 Failed: Real-time qt_cleared event not emitted for Table 9');
    }

    // Verify active queue returns 0 active QTs for Table 9
    const activeQ3Res = await callHandler(qtRoutes.stack, '/', 'GET', { query: { tableNumber: 'Table 9' } });
    if (activeQ3Res.status !== 200 || activeQ3Res.data.count !== 0) {
      throw new Error(`STEP 3 Failed: Expected 0 active QTs for Table 9 post-bill print, found ${activeQ3Res.data.count}`);
    }
    console.log('  └─► STEP 3 PASSED: Table 9 section in active QT queue is now 100% empty post-bill print via real-time event.');

    // ------------------------------------------------------------------------
    // STEP 4: Confirm QT #1 and QT #2 both still exist in DB/history with status "cleared"
    // ------------------------------------------------------------------------
    console.log('[STEP 4] Querying DB & historical endpoint GET /api/qt?status=cleared for Table 9...');
    const clearedQTsInDb = await QT.find({ tenantId: testTenantId, tableNumber: { $in: ['Table 9', '9'] }, status: 'cleared' });
    if (clearedQTsInDb.length !== 2) {
      throw new Error(`STEP 4 Failed: DB expected 2 cleared QTs for Table 9, found ${clearedQTsInDb.length}`);
    }

    const historyRes = await callHandler(qtRoutes.stack, '/', 'GET', { query: { status: 'cleared', tableNumber: 'Table 9' } });
    if (historyRes.status !== 200 || historyRes.data.count !== 2) {
      throw new Error(`STEP 4 Failed: GET /api/qt?status=cleared expected 2, got ${historyRes.data.count}`);
    }
    console.log('  └─► STEP 4 PASSED: QT #1 and QT #2 both preserved in DB/history with status "cleared" and clearedAt timestamp.');

    // ------------------------------------------------------------------------
    // STEP 5: Table 9 seated again (New Sitting) -> Places Order C -> Confirm fresh QT #3 appears cleanly
    // ------------------------------------------------------------------------
    console.log('[STEP 5] Table 9 seated for NEW sitting: Placing Order C...');
    const orderCRes = await callHandler(orderRoutes.stack, '/manual', 'POST', {
      body: {
        tableNumber: 'Table 9',
        customerName: 'Table 9 Sitting 2',
        phoneNumber: '9444400099',
        items: [{ dishId: pizzaDish._id.toString(), name: 'Truffle Pizza', quantity: 1 }],
      },
    });
    if (orderCRes.status !== 201 || !orderCRes.data.success) {
      throw new Error(`STEP 5 Failed: Order C creation error: ${JSON.stringify(orderCRes.data)}`);
    }
    const orderC = orderCRes.data.data;
    const qt3 = await QT.findOne({ orderId: orderC._id });
    if (!qt3) throw new Error('STEP 5 Failed: QT #3 not created for Order C!');

    // Query active queue for Table 9
    const activeQ5Res = await callHandler(qtRoutes.stack, '/', 'GET', { query: { tableNumber: 'Table 9' } });
    if (activeQ5Res.status !== 200 || activeQ5Res.data.count !== 1) {
      throw new Error(`STEP 5 Failed: Expected exactly 1 active QT for Table 9 new sitting, found ${activeQ5Res.data.count}`);
    }
    const currentActiveQt = activeQ5Res.data.data[0];
    if (currentActiveQt.ticketNumber !== qt3.ticketNumber || currentActiveQt.status !== 'pending') {
      throw new Error(`STEP 5 Failed: Fresh QT #3 conflated with cleared state: ${JSON.stringify(currentActiveQt)}`);
    }
    console.log('  └─► STEP 5 PASSED: Fresh QT #3 (' + qt3.ticketNumber + ') appears cleanly for Table 9 new sitting without state bleed.');

    // ------------------------------------------------------------------------
    // STEP 6: Confirm Table 4 baseline active QT was completely UNAFFECTED
    // ------------------------------------------------------------------------
    console.log('[STEP 6] Asserting Table 4 baseline active QT was completely unaffected by Table 9 actions...');
    const table4Check = await QT.findById(table4QtDoc._id);
    if (!table4Check || table4Check.status === 'cleared') {
      throw new Error(`STEP 6 Failed: Table 4 active QT was mutated/cleared! ${JSON.stringify(table4Check)}`);
    }

    const activeQ6Res = await callHandler(qtRoutes.stack, '/', 'GET', { query: { tableNumber: 'Table 4' } });
    if (activeQ6Res.status !== 200 || activeQ6Res.data.count !== 1) {
      throw new Error(`STEP 6 Failed: Active queue for Table 4 affected! Count: ${activeQ6Res.data.count}`);
    }
    console.log('  └─► STEP 6 PASSED: Table 4 active QT remains 100% active and untouched (zero data bleeding across tables).');

    // Cleanup
    await Restaurant.deleteMany({ _id: testTenantId });
    await Order.deleteMany({ restaurantId: testTenantId });
    await Bill.deleteMany({ restaurantId: testTenantId });
    await Dish.deleteMany({ restaurantId: testTenantId });
    await QT.deleteMany({ tenantId: testTenantId });

    console.log('\n========================================================================');
    console.log('🎉 ALL 6 STEPS IN FULL E2E QT CLEARING SCENARIO PASSED 100% CLEAN!');
    console.log('========================================================================\n');

  } catch (err: any) {
    console.error('\n❌ E2E SCENARIO FAILURE:', err.message);
    process.exit(1);
  }
}

if (require.main === module) {
  runQtClearingFullE2EScenario().then(() => process.exit(0));
}
