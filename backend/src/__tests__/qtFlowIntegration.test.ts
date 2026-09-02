import mongoose from 'mongoose';
import express from 'express';
import dotenv from 'dotenv';
import QT from '../models/QT';
import Order from '../models/Order';
import Dish from '../models/Dish';
import Restaurant from '../models/Restaurant';
import TableSession from '../models/TableSession';
import orderRoutes from '../routes/order';
import qtRoutes from '../routes/qt';
import { canonicalTableKey } from '../utils/tableUtils';

dotenv.config();

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/cafeflow';

async function runQTIntegrationTests() {
  console.log('\n===============================================================');
  console.log('RUNNING QT (QUICK TICKET / KOT) INTEGRATION & FLOW TEST SUITE');
  console.log('===============================================================\n');

  try {
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(MONGO_URI);
    }

    const testTenantId = new mongoose.Types.ObjectId();

    // 1. Setup tenant Restaurant
    await Restaurant.deleteMany({ _id: testTenantId });
    const testRestaurant = new Restaurant({
      _id: testTenantId,
      name: 'QT Integration Test Cafe',
      slug: `qt-cafe-${Date.now()}`,
      address: '456 Kitchen Lane',
      contact: '9876543210',
      taxRate: 5,
    });
    await testRestaurant.save();

    // 2. Setup Dishes
    const dosaDish = new Dish({
      restaurantId: testTenantId,
      name: 'Masala Dosa',
      price: 120,
      available: true,
      category: 'South Indian',
    });
    await dosaDish.save();

    const coffeeDish = new Dish({
      restaurantId: testTenantId,
      name: 'Filter Coffee',
      price: 40,
      available: true,
      category: 'Beverages',
    });
    await coffeeDish.save();

    const jamunDish = new Dish({
      restaurantId: testTenantId,
      name: 'Gulab Jamun',
      price: 60,
      available: true,
      category: 'Desserts',
    });
    await jamunDish.save();

    // 3. Setup Express test app with routes
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

    // Helper to invoke route handler directly with route stack
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
      reqMock.app = reqMock.app || { get: () => null };

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

    // Clean prior test data
    await QT.deleteMany({ tenantId: testTenantId });
    await Order.deleteMany({ restaurantId: testTenantId });
    await TableSession.deleteMany({ restaurantId: testTenantId });

    // ------------------------------------------------------------------------
    // (a) Order Placement Creates Exactly One Pending QT
    // ------------------------------------------------------------------------
    console.log('[Test A] Placing order #1 for Table 5 via POST /api/orders...');
    const order1Req: any = {
      body: {
        restaurantId: testTenantId.toString(),
        tableNumber: 'Table 5',
        customerName: 'Alice',
        phoneNumber: '9998887776',
        items: [
          { dishId: dosaDish._id.toString(), quantity: 2, specialInstructions: 'Crispy' },
          { dishId: coffeeDish._id.toString(), quantity: 1 },
        ],
      },
    };

    const order1Res = await callHandler(orderRoutes.stack, '/', 'POST', order1Req);
    if (order1Res.status !== 201 || !order1Res.data.success) {
      throw new Error(`Test A Failed: Order placement failed: ${JSON.stringify(order1Res)}`);
    }

    const createdOrder1 = order1Res.data.data;
    const qtsOrder1 = await QT.find({ tenantId: testTenantId, orderId: createdOrder1._id });

    if (qtsOrder1.length !== 1) {
      throw new Error(`Test A Failed: Expected exactly 1 QT for order #1, found ${qtsOrder1.length}`);
    }

    const qt1 = qtsOrder1[0];
    if (
      qt1.tableNumber !== canonicalTableKey('Table 5') ||
      qt1.status !== 'pending' ||
      qt1.items.length !== 2 ||
      !qt1.tenantId.equals(testTenantId)
    ) {
      throw new Error(`Test A Failed: QT data mismatch. Got: ${JSON.stringify(qt1)}`);
    }
    console.log(`  └─► PASS: Order #1 placed. Exactly 1 QT created with ticket ${qt1.ticketNumber} and status 'pending'!`);

    // ------------------------------------------------------------------------
    // (b) Second Order for Same Table Creates Second Independent QT
    // ------------------------------------------------------------------------
    console.log('[Test B] Placing order #2 for same Table 5 (e.g. re-order dessert)...');
    const order2Req: any = {
      body: {
        restaurantId: testTenantId.toString(),
        tableNumber: 'Table 5',
        customerName: 'Alice',
        phoneNumber: '9998887776',
        items: [
          { dishId: jamunDish._id.toString(), quantity: 2, specialInstructions: 'Warm' },
        ],
      },
    };

    const order2Res = await callHandler(orderRoutes.stack, '/', 'POST', order2Req);
    if (order2Res.status !== 201 || !order2Res.data.success) {
      throw new Error(`Test B Failed: Second order placement failed: ${JSON.stringify(order2Res)}`);
    }

    const allTable5Qts = await QT.find({ tenantId: testTenantId, tableNumber: canonicalTableKey('Table 5') }).sort({ createdAt: 1 });
    if (allTable5Qts.length !== 2) {
      throw new Error(`Test B Failed: Expected 2 separate QTs for Table 5, found ${allTable5Qts.length}`);
    }

    if (allTable5Qts[0]._id.equals(allTable5Qts[1]._id)) {
      throw new Error('Test B Failed: Second order overwrote the first QT record!');
    }

    if (allTable5Qts[0].items.length !== 2 || allTable5Qts[1].items.length !== 1) {
      throw new Error('Test B Failed: Item lists between the 2 QTs crossed over.');
    }
    console.log('  └─► PASS: Second order created a distinct, independent QT! (QT #1 items: 2, QT #2 items: 1)');

    // ------------------------------------------------------------------------
    // (c) List Endpoint (GET /api/qt) Filtering & Sorting Verification
    // ------------------------------------------------------------------------
    console.log('[Test C] Testing GET /api/qt filtering and most-recent-first sorting...');

    // Fetch all QTs
    const getListReq: any = {
      query: {},
      user: { restaurantId: testTenantId.toString(), role: 'restaurant_admin' },
    };
    const listRes = await callHandler(qtRoutes.stack, '/', 'GET', getListReq);
    if (listRes.status !== 200 || !listRes.data.success || listRes.data.count !== 2) {
      throw new Error(`Test C Failed: GET /api/qt returned incorrect list: ${JSON.stringify(listRes)}`);
    }

    // Verify most-recent-first sorting (QT #2 timestamp >= QT #1 timestamp)
    const listItems = listRes.data.data;
    const time0 = new Date(listItems[0].createdAt).getTime();
    const time1 = new Date(listItems[1].createdAt).getTime();
    if (time0 < time1) {
      throw new Error('Test C Failed: QTs are not sorted most recent first!');
    }

    // Filter by status=pending
    const filterPendingReq: any = {
      query: { status: 'pending' },
      user: { restaurantId: testTenantId.toString(), role: 'restaurant_admin' },
    };
    const pendingRes = await callHandler(qtRoutes.stack, '/', 'GET', filterPendingReq);
    if (pendingRes.data.count !== 2) {
      throw new Error(`Test C Failed: Expected 2 pending QTs, got ${pendingRes.data.count}`);
    }

    // Filter by tableNumber
    const filterTableReq: any = {
      query: { tableNumber: 'Table 5' },
      user: { restaurantId: testTenantId.toString(), role: 'restaurant_admin' },
    };
    const tableRes = await callHandler(qtRoutes.stack, '/', 'GET', filterTableReq);
    if (tableRes.data.count !== 2) {
      throw new Error(`Test C Failed: Filter by tableNumber failed`);
    }

    console.log('  └─► PASS: GET /api/qt properly filters by status/table and sorts most recent first!');

    // ------------------------------------------------------------------------
    // (d) Status Transitions (pending -> printed -> served)
    // ------------------------------------------------------------------------
    console.log('[Test D] Testing QT Status Transitions (pending -> printed -> served)...');
    const targetQtId = allTable5Qts[0]._id.toString();

    // Mark as printed
    const printReq: any = {
      params: { id: targetQtId },
      body: {},
      user: { restaurantId: testTenantId.toString(), role: 'restaurant_admin' },
    };
    const printRes = await callHandler(qtRoutes.stack, '/:id/printed', 'PATCH', printReq);
    if (printRes.status !== 200 || printRes.data.data.status !== 'printed') {
      throw new Error(`Test D Failed: Mark as printed failed: ${JSON.stringify(printRes)}`);
    }

    // Mark as served
    const serveReq: any = {
      params: { id: targetQtId },
      body: {},
      user: { restaurantId: testTenantId.toString(), role: 'restaurant_admin' },
    };
    const serveRes = await callHandler(qtRoutes.stack, '/:id/served', 'PATCH', serveReq);
    if (serveRes.status !== 200 || serveRes.data.data.status !== 'served') {
      throw new Error(`Test D Failed: Mark as served failed: ${JSON.stringify(serveRes)}`);
    }

    // Verify status update in DB
    const updatedQtInDb = await QT.findById(targetQtId);
    if (updatedQtInDb?.status !== 'served') {
      throw new Error(`Test D Failed: DB status mismatch. Expected 'served', got '${updatedQtInDb?.status}'`);
    }

    console.log('  └─► PASS: Status transitions (pending -> printed -> served) succeeded!');

    // ------------------------------------------------------------------------
    // (e) Manual Trace: Order #1 for Table 5 -> Order #2 for Table 5 (15 mins later)
    // ------------------------------------------------------------------------
    console.log('[Test E] Manual Trace Simulation: Order #1 at 12:00 PM vs Order #2 at 12:15 PM...');

    const time1200 = new Date('2026-09-02T12:00:00.000Z');
    const time1215 = new Date('2026-09-02T12:15:00.000Z');

    const simTable = 'Table-Sim-5';
    const orderA_Id = new mongoose.Types.ObjectId();
    const orderB_Id = new mongoose.Types.ObjectId();

    // Create QT #1 (12:00 PM)
    const simQt1 = new QT({
      tenantId: testTenantId,
      tableNumber: simTable,
      orderId: orderA_Id,
      items: [{ name: 'Tomato Soup', quantity: 2 }],
      status: 'pending',
      ticketNumber: await QT.generateNextTicketNumber(testTenantId, time1200),
      createdAt: time1200,
    });
    await simQt1.save();

    // Create QT #2 (12:15 PM - 15 minutes later)
    const simQt2 = new QT({
      tenantId: testTenantId,
      tableNumber: simTable,
      orderId: orderB_Id,
      items: [{ name: 'Brownie Sundae', quantity: 1 }],
      status: 'pending',
      ticketNumber: await QT.generateNextTicketNumber(testTenantId, time1215),
      createdAt: time1215,
    });
    await simQt2.save();

    const simResult = await QT.find({ tenantId: testTenantId, tableNumber: simTable }).sort({ createdAt: 1 });
    if (simResult.length !== 2) {
      throw new Error(`Test E Failed: Expected 2 QTs for Table-Sim-5, found ${simResult.length}`);
    }

    const durationDiffMinutes = (simResult[1].createdAt.getTime() - simResult[0].createdAt.getTime()) / (1000 * 60);
    if (durationDiffMinutes !== 15) {
      throw new Error(`Test E Failed: Expected 15 minutes timestamp gap between QTs, got ${durationDiffMinutes} mins`);
    }

    if (simResult[0].items[0].name !== 'Tomato Soup' || simResult[1].items[0].name !== 'Brownie Sundae') {
      throw new Error('Test E Failed: Items mismatched between simulated QTs');
    }

    console.log(`  └─► PASS: Simulated Order #1 (12:00 PM: Tomato Soup) and Order #2 (12:15 PM: Brownie Sundae). Both QTs exist independently with exact 15-minute timestamp gap!`);

    // Cleanup
    await Restaurant.deleteMany({ _id: testTenantId });
    await Dish.deleteMany({ restaurantId: testTenantId });
    await Order.deleteMany({ restaurantId: testTenantId });
    await TableSession.deleteMany({ restaurantId: testTenantId });
    await QT.deleteMany({ tenantId: testTenantId });

    console.log('\n===============================================================');
    console.log('ALL QT INTEGRATION & FLOW TESTS PASSED 100%');
    console.log('===============================================================\n');
  } catch (err: any) {
    console.error('\n❌ QT INTEGRATION TEST FAILURE:', err.message);
    process.exit(1);
  }
}

if (require.main === module) {
  runQTIntegrationTests().then(() => process.exit(0));
}
