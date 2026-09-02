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

async function runQtRealtimeLiveQueueSuite() {
  console.log('\n===============================================================');
  console.log('RUNNING QT REALTIME LIVE QUEUE UPDATES INTEGRATION SUITE');
  console.log('===============================================================\n');

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

    // Setup Restaurant & Dish
    const restaurant = new Restaurant({
      _id: testTenantId,
      name: 'Live Socket Bistro',
      slug: `livesocket-${ts}`,
      address: '99 Live St',
      contact: '9555566666',
      taxRate: 5,
    });
    await restaurant.save();

    const burgerDish = new Dish({
      restaurantId: testTenantId,
      name: 'Smoked Cheeseburger',
      price: 180,
      available: true,
      category: 'Mains',
    });
    await burgerDish.save();

    // Socket emission tracker
    const emittedEvents: Array<{ event: string; payload: any }> = [];
    const mockIo = {
      to: (room: string) => ({
        emit: (event: string, payload: any) => {
          emittedEvents.push({ event, payload });
          console.log(`  [MockSocket Emit -> Room: ${room}] Event: "${event}"`, payload?.ticketNumber || payload?.tableNumber || '');
        },
      }),
    };

    // Setup Express Mock Harness with mockIo
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

    // ------------------------------------------------------------------------
    // Step 1: Place New Order for Table 9 -> Verify QT creation & new_qt socket emit
    // ------------------------------------------------------------------------
    console.log('[Step 1] Placing new order for Table 9...');

    const orderRes = await callHandler(orderRoutes.stack, '/manual', 'POST', {
      body: {
        tableNumber: 'Table 9',
        customerName: 'Live Test Guest',
        phoneNumber: '9555500009',
        items: [{ dishId: burgerDish._id.toString(), name: 'Smoked Cheeseburger', quantity: 2 }],
      },
    });

    if (orderRes.status !== 201 || !orderRes.data.success) {
      throw new Error(`Step 1 Failed: POST /api/orders failed: ${JSON.stringify(orderRes.data)}`);
    }

    const createdOrder = orderRes.data.data;
    const qtDoc = await QT.findOne({ orderId: createdOrder._id });
    if (!qtDoc) {
      throw new Error('Step 1 Failed: QT record not created for Order!');
    }

    // Verify new_qt socket event was emitted
    const newQtEvent = emittedEvents.find((e) => e.event === 'new_qt');
    if (!newQtEvent || newQtEvent.payload.ticketNumber !== qtDoc.ticketNumber) {
      throw new Error(`Step 1 Failed: new_qt socket event not emitted! Emitted: ${JSON.stringify(emittedEvents)}`);
    }
    console.log('  └─► STEP 1 PASSED: new_qt event emitted for ticket ' + qtDoc.ticketNumber);

    // Verify Active Queue API returns Table 9 QT
    const queueRes1 = await callHandler(qtRoutes.stack, '/', 'GET', { query: { tableNumber: 'Table 9' } });
    if (queueRes1.status !== 200 || queueRes1.data.count !== 1) {
      throw new Error(`Step 1 Failed: Table 9 QT not present in active queue! Count: ${queueRes1.data.count}`);
    }
    console.log('  └─► Active Queue API verified: 1 active QT in queue for Table 9.');

    // ------------------------------------------------------------------------
    // Step 2: Print Final Bill for Table 9 -> Verify QT clearing & qt_cleared socket emit
    // ------------------------------------------------------------------------
    console.log('[Step 2] Printing final bill & completing order for Table 9 (PATCH /api/orders/:id/status)...');

    const completeRes = await callHandler(orderRoutes.stack, '/:id/status', 'PATCH', {
      params: { id: createdOrder._id.toString() },
      body: { status: 'completed', paymentMethod: 'cash' },
    });

    if (completeRes.status !== 200 || !completeRes.data.success) {
      throw new Error(`Step 2 Failed: PATCH /api/orders/:id/status failed: ${JSON.stringify(completeRes.data)}`);
    }

    // Verify qt_cleared socket event was emitted
    const qtClearedEvent = emittedEvents.find((e) => e.event === 'qt_cleared');
    if (!qtClearedEvent || !qtClearedEvent.payload.tableNumber.includes('9')) {
      throw new Error(`Step 2 Failed: qt_cleared socket event not emitted! Emitted: ${JSON.stringify(emittedEvents)}`);
    }
    console.log('  └─► STEP 2 PASSED: qt_cleared socket event emitted for Table 9!');

    // Verify Active Queue API no longer returns Table 9 QT
    const queueRes2 = await callHandler(qtRoutes.stack, '/', 'GET', { query: { tableNumber: 'Table 9' } });
    if (queueRes2.status !== 200 || queueRes2.data.count !== 0) {
      throw new Error(`Step 2 Failed: Table 9 QT still visible in active queue after bill print! Count: ${queueRes2.data.count}`);
    }
    console.log('  └─► Active Queue API verified: Table 9 QT automatically disappears from queue (0 active QTs).');

    // Cleanup
    await Restaurant.deleteMany({ _id: testTenantId });
    await Order.deleteMany({ restaurantId: testTenantId });
    await Bill.deleteMany({ restaurantId: testTenantId });
    await Dish.deleteMany({ restaurantId: testTenantId });
    await QT.deleteMany({ tenantId: testTenantId });

    console.log('\n===============================================================');
    console.log('QT REALTIME LIVE QUEUE UPDATES INTEGRATION SUITE PASSED 100%');
    console.log('===============================================================\n');
  } catch (err: any) {
    console.error('\n❌ REALTIME LIVE QUEUE TEST FAILURE:', err.message);
    process.exit(1);
  }
}

if (require.main === module) {
  runQtRealtimeLiveQueueSuite().then(() => process.exit(0));
}
