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

async function runQtClearingSuite() {
  console.log('\n===============================================================');
  console.log('RUNNING QT CLEARING ON FINAL BILL SETTLEMENT INTEGRATION SUITE');
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

    // 1. Setup Restaurant & Dish
    const restaurant = new Restaurant({
      _id: testTenantId,
      name: 'QT Clear Test Bistro',
      slug: `qtclear-${ts}`,
      address: '555 KOT Lane',
      contact: '9777788888',
      taxRate: 5,
    });
    await restaurant.save();

    const pastaDish = new Dish({
      restaurantId: testTenantId,
      name: 'Penne Arrabbiata',
      price: 250,
      available: true,
      category: 'Mains',
    });
    await pastaDish.save();

    const lemonadeDish = new Dish({
      restaurantId: testTenantId,
      name: 'Fresh Lemonade',
      price: 90,
      available: true,
      category: 'Beverages',
    });
    await lemonadeDish.save();

    // Setup Express Mock Harness
    const app = express();
    app.use(express.json());
    app.use((req: any, res: any, next: any) => {
      req.user = {
        _id: new mongoose.Types.ObjectId().toString(),
        restaurantId: testTenantId.toString(),
        role: 'restaurant_admin',
      };
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
    // Step A: Create 2 Orders for Table 5 -> Generates 2 Active QTs
    // ------------------------------------------------------------------------
    console.log('[Step A] Placing Order 1 for Table 5...');
    const order1 = await Order.create({
      restaurantId: testTenantId,
      tableNumber: 'Table 5',
      customerName: 'Guest 1',
      phoneNumber: '9888800001',
      status: 'received',
      items: [{ dishId: pastaDish._id, name: 'Penne Arrabbiata', price: 250, quantity: 2 }],
      subtotal: 500,
      tax: 25,
      totalAmount: 525,
    });
    const qt1 = await QT.createForOrder(order1);

    console.log('[Step A] Placing Order 2 for Table 5 (second round of drinks)...');
    const order2 = await Order.create({
      restaurantId: testTenantId,
      tableNumber: 'Table 5',
      customerName: 'Guest 1',
      phoneNumber: '9888800001',
      status: 'received',
      items: [{ dishId: lemonadeDish._id, name: 'Fresh Lemonade', price: 90, quantity: 3 }],
      subtotal: 270,
      tax: 13.5,
      totalAmount: 283.5,
    });
    const qt2 = await QT.createForOrder(order2);

    // Verify 2 Active QTs in Active Queue
    console.log('[Step A] Verifying Table 5 has 2 active QTs in active queue...');
    const activeQueueRes1 = await callHandler(qtRoutes.stack, '/', 'GET', { query: { tableNumber: 'Table 5' } });
    if (activeQueueRes1.status !== 200 || activeQueueRes1.data.count !== 2) {
      throw new Error(`Step A Failed: Expected 2 active QTs for Table 5, found ${activeQueueRes1.data.count}`);
    }
    console.log('  └─► Table 5 active QTs before bill print: 2 (QT #1: ' + qt1.ticketNumber + ', QT #2: ' + qt2.ticketNumber + ')');

    // ------------------------------------------------------------------------
    // Step B: Print Final Bill for Table 5 -> Completes order & triggers QT clearing
    // ------------------------------------------------------------------------
    console.log('[Step B] Completing Order & Printing Final Bill for Table 5 (PATCH /api/orders/:id/status)...');
    const completeRes = await callHandler(orderRoutes.stack, '/:id/status', 'PATCH', {
      params: { id: order1._id.toString() },
      body: { status: 'completed', paymentMethod: 'cash' },
    });

    if (completeRes.status !== 200 || !completeRes.data.success) {
      throw new Error(`Step B Failed: Complete order returned error: ${JSON.stringify(completeRes)}`);
    }
    console.log('  └─► Final Bill printed & payment approved for Table 5!');

    // ------------------------------------------------------------------------
    // Step C: Verify Active Queue Excludes Table 5 QTs Immediately
    // ------------------------------------------------------------------------
    console.log('[Step C] Querying Active QT Queue GET /api/qt for Table 5...');
    const activeQueueRes2 = await callHandler(qtRoutes.stack, '/', 'GET', { query: {} });
    const table5ActiveQTs = activeQueueRes2.data.data.filter((q: any) => q.tableNumber.includes('5'));

    if (table5ActiveQTs.length !== 0) {
      throw new Error(`Step C Failed: Expected 0 active QTs for Table 5 in active queue, found ${table5ActiveQTs.length}`);
    }
    console.log('  └─► Active Queue Verified: Table 5 has 0 active QTs in queue!');

    // ------------------------------------------------------------------------
    // Step D: Verify Cleared QTs Still Exist in DB / Retrievable via History Query
    // ------------------------------------------------------------------------
    console.log('[Step D] Directly querying MongoDB & GET /api/qt?status=cleared for historical QTs...');
    const clearedDbQTs = await QT.find({ tenantId: testTenantId, tableNumber: 'Table 5', status: 'cleared' });

    if (clearedDbQTs.length !== 2) {
      throw new Error(`Step D Failed: Expected 2 cleared QTs in DB for Table 5, found ${clearedDbQTs.length}`);
    }

    const historyRes = await callHandler(qtRoutes.stack, '/', 'GET', { query: { status: 'cleared', tableNumber: 'Table 5' } });
    if (historyRes.status !== 200 || historyRes.data.count !== 2) {
      throw new Error(`Step D Failed: GET /api/qt?status=cleared returned ${historyRes.data.count}`);
    }
    console.log('  └─► DB History Verified: Both QTs exist in DB with status "cleared" and clearedAt timestamp!');

    // ------------------------------------------------------------------------
    // Step E: Place NEW Order for Table 5 (New Sitting) -> Starts Fresh Pending QT
    // ------------------------------------------------------------------------
    console.log('[Step E] Table 5 reused for NEW sitting: Placing Order 3 for Table 5...');
    const order3 = await Order.create({
      restaurantId: testTenantId,
      tableNumber: 'Table 5',
      customerName: 'New Guest Sitting 2',
      phoneNumber: '9777700002',
      status: 'received',
      items: [{ dishId: pastaDish._id, name: 'Penne Arrabbiata', price: 250, quantity: 1 }],
      subtotal: 250,
      tax: 12.5,
      totalAmount: 262.5,
    });
    const freshQt = await QT.createForOrder(order3);

    console.log('[Step E] Querying active QT queue for Table 5...');
    const activeQueueRes3 = await callHandler(qtRoutes.stack, '/', 'GET', { query: { tableNumber: 'Table 5' } });

    if (activeQueueRes3.status !== 200 || activeQueueRes3.data.count !== 1) {
      throw new Error(`Step E Failed: Expected 1 fresh pending QT for Table 5, found ${activeQueueRes3.data.count}`);
    }

    const currentActiveQt = activeQueueRes3.data.data[0];
    if (currentActiveQt.status !== 'pending' || currentActiveQt.ticketNumber !== freshQt.ticketNumber) {
      throw new Error(`Step E Failed: Fresh QT conflated with cleared ones: ${JSON.stringify(currentActiveQt)}`);
    }
    console.log('  └─► New Sitting Clean: Fresh QT ' + freshQt.ticketNumber + ' created as pending without any conflation!');

    // Cleanup
    await Restaurant.deleteMany({ _id: testTenantId });
    await Order.deleteMany({ restaurantId: testTenantId });
    await Bill.deleteMany({ restaurantId: testTenantId });
    await Dish.deleteMany({ restaurantId: testTenantId });
    await QT.deleteMany({ tenantId: testTenantId });

    console.log('\n===============================================================');
    console.log('QT CLEARING ON FINAL BILL SETTLEMENT SUITE PASSED 100%');
    console.log('===============================================================\n');

  } catch (err: any) {
    console.error('\n❌ QT CLEARING TEST FAILURE:', err.message);
    process.exit(1);
  }
}

if (require.main === module) {
  runQtClearingSuite().then(() => process.exit(0));
}
