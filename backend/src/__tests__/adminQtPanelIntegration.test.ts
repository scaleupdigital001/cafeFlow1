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

dotenv.config();

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/cafeflow';

async function runAdminQtPanelIntegrationTests() {
  console.log('\n===============================================================');
  console.log('RUNNING ADMIN QT/KOT PANEL & PRINTING INTEGRATION TEST SUITE');
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
      name: 'Admin Panel Test Cafe',
      slug: `admin-qt-${Date.now()}`,
      address: '789 KOT Highway',
      contact: '9555544444',
      taxRate: 5,
    });
    await testRestaurant.save();

    // 2. Setup Express test app with routes
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

    // Helper to invoke route handler cleanly
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

    // Clean prior test data
    await QT.deleteMany({ tenantId: testTenantId });

    // ------------------------------------------------------------------------
    // Test 1: Multiple QTs for the SAME table render as SEPARATE independent entries
    // ------------------------------------------------------------------------
    console.log('[Test 1] Verifying multiple QTs for Table 5 render as separate independent entries...');

    const orderId1 = new mongoose.Types.ObjectId();
    const orderId2 = new mongoose.Types.ObjectId();

    const qt1 = await QT.createForOrder({
      tenantId: testTenantId,
      tableNumber: 'Table 5',
      _id: orderId1,
      items: [
        { name: 'Paneer Tikka', quantity: 1, specialInstructions: 'Medium spicy' },
        { name: 'Cold Drink', quantity: 2 },
      ],
    });

    const qt2 = await QT.createForOrder({
      tenantId: testTenantId,
      tableNumber: 'Table 5',
      _id: orderId2,
      items: [
        { name: 'Sizzling Brownie', quantity: 1 },
      ],
    });

    // Query GET /api/qt
    const listRes = await callHandler(qtRoutes.stack, '/', 'GET', { query: {} });
    if (listRes.status !== 200 || !listRes.data.success || listRes.data.count !== 2) {
      throw new Error(`Test 1 Failed: GET /api/qt expected 2 items, got ${listRes.data.count}`);
    }

    const fetchedList = listRes.data.data;
    if (fetchedList[0]._id.toString() === fetchedList[1]._id.toString()) {
      throw new Error('Test 1 Failed: QTs are merged! Expected two separate tickets.');
    }

    if (fetchedList[0].tableNumber !== 'T-5' && fetchedList[0].tableNumber !== 'Table 5') {
      throw new Error(`Test 1 Failed: Table number mismatch: ${fetchedList[0].tableNumber}`);
    }

    console.log(`  └─► PASS: Table 5 has 2 separate tickets (${fetchedList[0].ticketNumber} & ${fetchedList[1].ticketNumber}) — never merged!`);

    // ------------------------------------------------------------------------
    // Test 2: Print button calls mark-as-printed endpoint & updates target ticket only
    // ------------------------------------------------------------------------
    console.log('[Test 2] Clicking Print button calls mark-as-printed endpoint...');

    const printTargetId = qt1._id.toString();
    const printRes = await callHandler(qtRoutes.stack, '/:id/printed', 'PATCH', { params: { id: printTargetId } });

    if (printRes.status !== 200 || !printRes.data.success || printRes.data.data.status !== 'printed') {
      throw new Error(`Test 2 Failed: Mark as printed endpoint failed: ${JSON.stringify(printRes)}`);
    }

    // Verify in DB that target ticket is 'printed' while second ticket remains 'pending'
    const updatedQt1InDb = await QT.findById(qt1._id);
    const updatedQt2InDb = await QT.findById(qt2._id);

    if (updatedQt1InDb?.status !== 'printed') {
      throw new Error(`Test 2 Failed: Target QT #1 status not updated to 'printed'`);
    }

    if (updatedQt2InDb?.status !== 'pending') {
      throw new Error(`Test 2 Failed: Non-target QT #2 status was unexpectedly modified`);
    }

    console.log('  └─► PASS: Mark-as-printed endpoint updated target ticket #1 to "printed" while ticket #2 remained "pending"!');

    // ------------------------------------------------------------------------
    // Test 3: Status Badges reflect states (pending -> printed -> served)
    // ------------------------------------------------------------------------
    console.log('[Test 3] Verifying status badges reflect pending, printed, and served states...');

    const serveRes = await callHandler(qtRoutes.stack, '/:id/served', 'PATCH', { params: { id: printTargetId } });
    if (serveRes.status !== 200 || serveRes.data.data.status !== 'served') {
      throw new Error(`Test 3 Failed: Mark as served endpoint failed`);
    }

    const finalQueryRes = await callHandler(qtRoutes.stack, '/', 'GET', { query: {} });
    const finalTickets = finalQueryRes.data.data;

    const servedTicket = finalTickets.find((t: any) => t._id.toString() === printTargetId);
    const pendingTicket = finalTickets.find((t: any) => t._id.toString() === qt2._id.toString());

    if (servedTicket.status !== 'served') {
      throw new Error(`Test 3 Failed: Expected ticket 1 status 'served', got ${servedTicket.status}`);
    }

    if (pendingTicket.status !== 'pending') {
      throw new Error(`Test 3 Failed: Expected ticket 2 status 'pending', got ${pendingTicket.status}`);
    }

    console.log('  └─► PASS: Badges reflect states accurately (Ticket #1: "served", Ticket #2: "pending")!');

    // ------------------------------------------------------------------------
    // Test 4: Manual Trace: Two orders for Table 5 -> 2 separate printable cards
    // ------------------------------------------------------------------------
    console.log('[Test 4] Manual Trace: Two orders for Table 5 confirm 2 separate printable cards...');

    const table5Qts = await QT.find({ tenantId: testTenantId, tableNumber: { $in: ['Table 5', 'T-5'] } }).sort({ createdAt: 1 });
    if (table5Qts.length !== 2) {
      throw new Error(`Test 4 Failed: Expected 2 separate tickets for Table 5 in DB, found ${table5Qts.length}`);
    }

    console.log(`  └─► PASS Manual Trace: Table 5 has 2 separate printable ticket cards:`);
    console.log(`      Card 1: Ticket ${table5Qts[0].ticketNumber} | Status: ${table5Qts[0].status} | Items: ${table5Qts[0].items.map((i) => i.name).join(', ')}`);
    console.log(`      Card 2: Ticket ${table5Qts[1].ticketNumber} | Status: ${table5Qts[1].status} | Items: ${table5Qts[1].items.map((i) => i.name).join(', ')}`);

    // Cleanup
    await Restaurant.deleteMany({ _id: testTenantId });
    await QT.deleteMany({ tenantId: testTenantId });

    console.log('\n===============================================================');
    console.log('ALL ADMIN QT PANEL INTEGRATION TESTS PASSED 100%');
    console.log('===============================================================\n');
  } catch (err: any) {
    console.error('\n❌ ADMIN QT PANEL INTEGRATION TEST FAILURE:', err.message);
    process.exit(1);
  }
}

if (require.main === module) {
  runAdminQtPanelIntegrationTests().then(() => process.exit(0));
}
