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

async function runQTEndToEndVerification() {
  console.log('\n================================================================');
  console.log('FULL END-TO-END VERIFICATION: QUICK TICKET (QT / KOT) LIFECYCLE');
  console.log('================================================================\n');

  try {
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(MONGO_URI);
    }

    const testTenantId = new mongoose.Types.ObjectId();

    // Setup tenant Restaurant
    await Restaurant.deleteMany({ _id: testTenantId });
    const testRestaurant = new Restaurant({
      _id: testTenantId,
      name: 'E2E Verification Cafe',
      slug: `e2e-qt-${Date.now()}`,
      address: '456 Verification Blvd',
      contact: '9777766666',
      taxRate: 5,
    });
    await testRestaurant.save();

    // Setup Dishes
    const paneerDish = new Dish({
      restaurantId: testTenantId,
      name: 'Paneer Tikka',
      price: 220,
      available: true,
      category: 'Starters',
    });
    await paneerDish.save();

    const naanDish = new Dish({
      restaurantId: testTenantId,
      name: 'Garlic Naan',
      price: 50,
      available: true,
      category: 'Breads',
    });
    await naanDish.save();

    const brownieDish = new Dish({
      restaurantId: testTenantId,
      name: 'Brownie Sundae',
      price: 180,
      available: true,
      category: 'Desserts',
    });
    await brownieDish.save();

    const sodaDish = new Dish({
      restaurantId: testTenantId,
      name: 'Fresh Lime Soda',
      price: 80,
      available: true,
      category: 'Beverages',
    });
    await sodaDish.save();

    // Express app & socket emitter mock
    const app = express();
    app.use(express.json());

    const adminQueueState: any[] = [];
    const socketLog: { event: string; payload: any }[] = [];

    const mockIo = {
      to: (room: string) => ({
        emit: (event: string, payload: any) => {
          socketLog.push({ event, payload });
          if (event === 'new_qt' && payload) {
            const exists = adminQueueState.some((q) => q._id.toString() === payload._id.toString());
            if (!exists) {
              adminQueueState.unshift(payload);
            }
          } else if (event === 'qt_status_updated' && payload) {
            const idx = adminQueueState.findIndex((q) => q._id.toString() === payload._id.toString());
            if (idx !== -1) {
              adminQueueState[idx] = payload;
            }
          }
        },
      }),
    };

    app.set('io', mockIo);
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

    // Route invoker helper
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

    // Clean prior collection state
    await QT.deleteMany({ tenantId: testTenantId });
    await Order.deleteMany({ restaurantId: testTenantId });
    await TableSession.deleteMany({ restaurantId: testTenantId });

    // ========================================================================
    // STEP 1: Place Order A for Table 7 with 2 items
    // ========================================================================
    console.log('[STEP 1] Placing Order A for Table 7 (Paneer Tikka x1, Garlic Naan x2)...');

    const orderReqA: any = {
      body: {
        restaurantId: testTenantId.toString(),
        tableNumber: 'Table 7',
        customerName: 'Customer A',
        phoneNumber: '9111122222',
        items: [
          { dishId: paneerDish._id.toString(), quantity: 1, specialInstructions: 'Extra spicy' },
          { dishId: naanDish._id.toString(), quantity: 2 },
        ],
      },
    };

    const resA = await callHandler(orderRoutes.stack, '/', 'POST', orderReqA);
    if (resA.status !== 201 || !resA.data.success || !resA.data.qt) {
      throw new Error(`Step 1 Failed: Order A placement failed: ${JSON.stringify(resA)}`);
    }

    console.log(`  └─► Order A placed successfully! Response confirmed QT creation.`);

    // ========================================================================
    // STEP 2: Confirm QT #1 created for Table 7 as "pending" in admin queue
    // ========================================================================
    console.log('[STEP 2] Verifying QT #1 for Table 7 in admin queue (status = "pending")...');

    const listRes1 = await callHandler(qtRoutes.stack, '/', 'GET', { query: {} });
    if (listRes1.status !== 200 || !listRes1.data.success || listRes1.data.count !== 1) {
      throw new Error(`Step 2 Failed: Expected 1 QT in queue, found ${listRes1.data.count}`);
    }

    const qt1Data = listRes1.data.data[0];
    const canonTable = qt1Data.tableNumber.toString().toLowerCase();
    if (!canonTable.includes('7')) {
      throw new Error(`Step 2 Failed: Incorrect table number ${qt1Data.tableNumber}`);
    }
    if (qt1Data.status !== 'pending') {
      throw new Error(`Step 2 Failed: Expected status "pending", got "${qt1Data.status}"`);
    }
    if (qt1Data.items.length !== 2) {
      throw new Error(`Step 2 Failed: Expected 2 items in QT #1, found ${qt1Data.items.length}`);
    }

    const qt1Id = qt1Data._id.toString();
    const qt1TicketNum = qt1Data.ticketNumber;

    console.log(`  └─► Confirmed QT #1 (${qt1TicketNum}) created for Table 7 with 2 items. Status: PENDING.`);

    // ========================================================================
    // STEP 3: Admin prints QT #1 → confirm status flips to "printed"
    // ========================================================================
    console.log('[STEP 3] Admin prints QT #1 (PATCH /api/qt/:id/printed)...');

    const printRes1 = await callHandler(qtRoutes.stack, '/:id/printed', 'PATCH', { params: { id: qt1Id } });
    if (printRes1.status !== 200 || !printRes1.data.success || printRes1.data.data.status !== 'printed') {
      throw new Error(`Step 3 Failed: Printing QT #1 failed: ${JSON.stringify(printRes1)}`);
    }

    const listRes2 = await callHandler(qtRoutes.stack, '/', 'GET', { query: {} });
    const qt1Updated = listRes2.data.data.find((q: any) => q._id.toString() === qt1Id);
    if (qt1Updated.status !== 'printed') {
      throw new Error(`Step 3 Failed: QT #1 status did not update to "printed".`);
    }

    console.log(`  └─► QT #1 (${qt1TicketNum}) status successfully flipped to: PRINTED.`);

    // ========================================================================
    // STEP 4: 15 minutes later, place Order B for Table 7 with different items
    // ========================================================================
    console.log('[STEP 4] 15 mins later simulation: Placing Order B for Table 7 (Brownie Sundae x1, Fresh Lime Soda x2)...');

    // Simulate 15 min gap
    await new Promise((resolve) => setTimeout(resolve, 50));

    const orderReqB: any = {
      body: {
        restaurantId: testTenantId.toString(),
        tableNumber: 'Table 7',
        customerName: 'Customer A',
        phoneNumber: '9111122222',
        items: [
          { dishId: brownieDish._id.toString(), quantity: 1 },
          { dishId: sodaDish._id.toString(), quantity: 2, specialInstructions: 'Less sugar' },
        ],
      },
    };

    const resB = await callHandler(orderRoutes.stack, '/', 'POST', orderReqB);
    if (resB.status !== 201 || !resB.data.success || !resB.data.qt) {
      throw new Error(`Step 4 Failed: Order B placement failed: ${JSON.stringify(resB)}`);
    }

    console.log(`  └─► Order B placed successfully! Distinct ticket ${resB.data.qt.ticketNumber} created.`);

    // ========================================================================
    // STEP 5: Confirm QT #2 created as SEPARATE ticket (QT #1 still "printed", QT #2 "pending")
    // ========================================================================
    console.log('[STEP 5] Verifying QT #2 is SEPARATE ticket (QT #1 remains "printed", QT #2 is "pending")...');

    const listRes3 = await callHandler(qtRoutes.stack, '/', 'GET', { query: {} });
    if (listRes3.data.count !== 2) {
      throw new Error(`Step 5 Failed: Expected 2 QTs in queue, found ${listRes3.data.count}`);
    }

    const fetchedQTs = listRes3.data.data;
    const qt1InQueue = fetchedQTs.find((q: any) => q._id.toString() === qt1Id);
    const qt2InQueue = fetchedQTs.find((q: any) => q._id.toString() !== qt1Id);

    if (!qt1InQueue) throw new Error('Step 5 Failed: QT #1 missing from queue!');
    if (!qt2InQueue) throw new Error('Step 5 Failed: QT #2 missing from queue!');

    if (qt1InQueue.status !== 'printed') {
      throw new Error(`Step 5 Failed: QT #1 status mutated unexpectedly to "${qt1InQueue.status}"!`);
    }
    if (qt2InQueue.status !== 'pending') {
      throw new Error(`Step 5 Failed: QT #2 status should be "pending", got "${qt2InQueue.status}"`);
    }

    if (qt1InQueue.ticketNumber === qt2InQueue.ticketNumber) {
      throw new Error('Step 5 Failed: Ticket numbers are identical!');
    }

    const qt2Id = qt2InQueue._id.toString();
    const qt2TicketNum = qt2InQueue.ticketNumber;

    console.log(`  └─► Confirmed QT #2 (${qt2TicketNum}) created as SEPARATE ticket (Status: PENDING). QT #1 (${qt1TicketNum}) unchanged (Status: PRINTED).`);

    // ========================================================================
    // STEP 6: Admin prints QT #2 → confirm only QT #2's status changes
    // ========================================================================
    console.log('[STEP 6] Admin prints QT #2 (PATCH /api/qt/:id/printed)...');

    const printRes2 = await callHandler(qtRoutes.stack, '/:id/printed', 'PATCH', { params: { id: qt2Id } });
    if (printRes2.status !== 200 || !printRes2.data.success || printRes2.data.data.status !== 'printed') {
      throw new Error(`Step 6 Failed: Printing QT #2 failed: ${JSON.stringify(printRes2)}`);
    }

    const listRes4 = await callHandler(qtRoutes.stack, '/', 'GET', { query: {} });
    const finalQueue = listRes4.data.data;

    const qt1Final = finalQueue.find((q: any) => q._id.toString() === qt1Id);
    const qt2Final = finalQueue.find((q: any) => q._id.toString() === qt2Id);

    if (qt1Final.status !== 'printed') {
      throw new Error(`Step 6 Failed: QT #1 status corrupted during QT #2 print action!`);
    }
    if (qt2Final.status !== 'printed') {
      throw new Error(`Step 6 Failed: QT #2 status failed to flip to "printed"!`);
    }

    console.log(`  └─► QT #2 (${qt2TicketNum}) printed successfully! QT #1 remains PRINTED.`);

    // ========================================================================
    // STEP 7: Audit full queue state — no duplication, no overwriting, no data bleeding
    // ========================================================================
    console.log('[STEP 7] Final Audit: Verifying queue state across all 7 steps...');

    if (finalQueue.length !== 2) {
      throw new Error(`Step 7 Failed: Final queue length expected 2, found ${finalQueue.length}`);
    }

    // Verify item insulation between tickets
    const qt1ItemNames = qt1Final.items.map((i: any) => i.name).sort();
    const qt2ItemNames = qt2Final.items.map((i: any) => i.name).sort();

    if (JSON.stringify(qt1ItemNames) !== JSON.stringify(['Garlic Naan', 'Paneer Tikka'])) {
      throw new Error(`Step 7 Failed: QT #1 items corrupted: ${JSON.stringify(qt1ItemNames)}`);
    }
    if (JSON.stringify(qt2ItemNames) !== JSON.stringify(['Brownie Sundae', 'Fresh Lime Soda'])) {
      throw new Error(`Step 7 Failed: QT #2 items corrupted: ${JSON.stringify(qt2ItemNames)}`);
    }

    console.log(`  └─► AUDIT PASSED: Zero duplication, zero overwriting, zero item bleeding across tickets!`);

    // Clean test data
    await Restaurant.deleteMany({ _id: testTenantId });
    await Dish.deleteMany({ restaurantId: testTenantId });
    await Order.deleteMany({ restaurantId: testTenantId });
    await TableSession.deleteMany({ restaurantId: testTenantId });
    await QT.deleteMany({ tenantId: testTenantId });

    console.log('\n================================================================');
    console.log('DONE — verified end-to-end');
    console.log('================================================================\n');
  } catch (err: any) {
    console.error('\n❌ E2E SCENARIO FAILURE:', err.message);
    process.exit(1);
  }
}

if (require.main === module) {
  runQTEndToEndVerification().then(() => process.exit(0));
}
