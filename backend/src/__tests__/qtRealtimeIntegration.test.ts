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

async function runQTRealtimeIntegrationTests() {
  console.log('\n===============================================================');
  console.log('RUNNING REALTIME QT QUEUE UPDATES & CONFIRMATION TEST SUITE');
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
      name: 'Realtime QT Test Cafe',
      slug: `qt-realtime-${Date.now()}`,
      address: '100 Realtime Ave',
      contact: '9123456789',
      taxRate: 5,
    });
    await testRestaurant.save();

    // 2. Setup Dishes
    const burgerDish = new Dish({
      restaurantId: testTenantId,
      name: 'Veggie Burger',
      price: 150,
      available: true,
      category: 'Main Course',
    });
    await burgerDish.save();

    const shakeDish = new Dish({
      restaurantId: testTenantId,
      name: 'Chocolate Shake',
      price: 90,
      available: true,
      category: 'Beverages',
    });
    await shakeDish.save();

    // 3. Setup Express test app with mock Socket.IO emitter
    const app = express();
    app.use(express.json());

    // Admin QT Queue state simulation (in-memory state updated live via socket event mock)
    const adminQtQueueState: any[] = [];
    let receivedSocketEvent: string | null = null;
    let receivedSocketPayload: any = null;

    const mockIo = {
      to: (room: string) => ({
        emit: (event: string, payload: any) => {
          receivedSocketEvent = event;
          receivedSocketPayload = payload;

          // Simulate admin QT Queue state live update without page reload
          if (event === 'new_qt' && payload) {
            const exists = adminQtQueueState.some((q) => q._id.toString() === payload._id.toString());
            if (!exists) {
              adminQtQueueState.unshift(payload);
            }
          } else if (event === 'qt_status_updated' && payload) {
            const idx = adminQtQueueState.findIndex((q) => q._id.toString() === payload._id.toString());
            if (idx !== -1) {
              adminQtQueueState[idx] = payload;
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
    await Order.deleteMany({ restaurantId: testTenantId });
    await TableSession.deleteMany({ restaurantId: testTenantId });

    // ------------------------------------------------------------------------
    // Test 1: Order submission confirms QT creation & pushes to Admin QT Queue live
    // ------------------------------------------------------------------------
    console.log('[Test 1] Order placement pushes ticket to Admin QT Queue live without page reload...');

    const orderReq1: any = {
      body: {
        restaurantId: testTenantId.toString(),
        tableNumber: 'Table 5',
        customerName: 'Bob',
        phoneNumber: '9888877776',
        items: [
          { dishId: burgerDish._id.toString(), quantity: 1 },
          { dishId: shakeDish._id.toString(), quantity: 2 },
        ],
      },
    };

    const res1 = await callHandler(orderRoutes.stack, '/', 'POST', orderReq1);

    if (res1.status !== 201 || !res1.data.success) {
      throw new Error(`Test 1 Failed: Order submission failed: ${JSON.stringify(res1)}`);
    }

    // Verify response contains confirmed QT object
    if (!res1.data.qt || !res1.data.qt.ticketNumber) {
      throw new Error('Test 1 Failed: Order response did not confirm QT creation object.');
    }

    // Verify live socket event was dispatched immediately
    if (receivedSocketEvent !== 'new_qt' || !receivedSocketPayload) {
      throw new Error(`Test 1 Failed: Real-time 'new_qt' socket event was not dispatched! Received: ${receivedSocketEvent}`);
    }

    const getQueueLength = (queue: any[]): number => queue.length;

    // Verify Admin QT Queue state updated live without manual refresh
    if (getQueueLength(adminQtQueueState) !== 1 || adminQtQueueState[0].ticketNumber !== res1.data.qt.ticketNumber) {
      throw new Error('Test 1 Failed: Admin QT queue state was not updated live.');
    }

    console.log(`  └─► PASS: Confirmed QT ${res1.data.qt.ticketNumber} created & pushed to Admin QT Queue live!`);

    // ------------------------------------------------------------------------
    // Test 2: Placing second order for Table 5 (15 mins later) adds 2nd independent QT
    // ------------------------------------------------------------------------
    console.log('[Test 2] Placing second order for Table 5 (15 mins later simulation)...');

    const orderReq2: any = {
      body: {
        restaurantId: testTenantId.toString(),
        tableNumber: 'Table 5',
        customerName: 'Bob',
        phoneNumber: '9888877776',
        items: [
          { dishId: shakeDish._id.toString(), quantity: 1, specialInstructions: 'Extra Cold' },
        ],
      },
    };

    const res2 = await callHandler(orderRoutes.stack, '/', 'POST', orderReq2);
    if (res2.status !== 201 || !res2.data.success || !res2.data.qt) {
      throw new Error('Test 2 Failed: Second order failed or missing confirmed QT');
    }

    if (getQueueLength(adminQtQueueState) !== 2) {
      throw new Error(`Test 2 Failed: Expected 2 QTs in Admin Queue, found ${adminQtQueueState.length}`);
    }

    const ticketA = String(adminQtQueueState[0].ticketNumber);
    const ticketB = String(adminQtQueueState[1].ticketNumber);
    if (ticketA === ticketB) {
      throw new Error('Test 2 Failed: Second QT overwrote first ticket!');
    }

    console.log(`  └─► PASS: Second order created distinct ticket ${res2.data.qt.ticketNumber}. Admin queue has 2 independent QTs!`);

    // ------------------------------------------------------------------------
    // Test 3: Status update event ('printed') updates Admin QT Queue state live
    // ------------------------------------------------------------------------
    console.log('[Test 3] Updating QT status to "printed" via PATCH /api/qt/:id/printed...');

    const printQtId = adminQtQueueState[1]._id.toString();
    const printReq: any = {
      params: { id: printQtId },
      body: {},
      user: { restaurantId: testTenantId.toString(), role: 'restaurant_admin' },
    };

    const printRes = await callHandler(qtRoutes.stack, '/:id/printed', 'PATCH', printReq);
    if (printRes.status !== 200 || !printRes.data.success) {
      throw new Error(`Test 3 Failed: Mark as printed failed: ${JSON.stringify(printRes)}`);
    }

    if (receivedSocketEvent !== 'qt_status_updated') {
      throw new Error(`Test 3 Failed: Expected 'qt_status_updated' socket event, got '${receivedSocketEvent}'`);
    }

    const updatedInQueue = adminQtQueueState.find((q) => q._id.toString() === printQtId);
    if (updatedInQueue?.status !== 'printed') {
      throw new Error(`Test 3 Failed: Admin queue QT status was not updated live to 'printed'`);
    }

    console.log('  └─► PASS: QT marked as printed and Admin QT Queue state updated live!');

    // Cleanup
    await Restaurant.deleteMany({ _id: testTenantId });
    await Dish.deleteMany({ restaurantId: testTenantId });
    await Order.deleteMany({ restaurantId: testTenantId });
    await TableSession.deleteMany({ restaurantId: testTenantId });
    await QT.deleteMany({ tenantId: testTenantId });

    console.log('\n===============================================================');
    console.log('REALTIME QT QUEUE & CONFIRMATION TESTS PASSED 100%');
    console.log('===============================================================\n');
  } catch (err: any) {
    console.error('\n❌ REALTIME QT TEST FAILURE:', err.message);
    process.exit(1);
  }
}

if (require.main === module) {
  runQTRealtimeIntegrationTests().then(() => process.exit(0));
}
