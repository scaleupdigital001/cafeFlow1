import mongoose from 'mongoose';
import express from 'express';
import dotenv from 'dotenv';
import Order from '../models/Order';
import TableSession from '../models/TableSession';
import Bill from '../models/Bill';
import Dish from '../models/Dish';
import Restaurant from '../models/Restaurant';
import WaiterRequest from '../models/WaiterRequest';
import orderRoutes from '../routes/order';
import analyticsRoutes from '../routes/analytics';
import { canonicalTableKey } from '../utils/tableUtils';

dotenv.config();

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/cafeflow';

async function runCancellationAndItemRemovalTests() {
  console.log('\n===============================================================');
  console.log('RUNNING PRODUCTION TEST SUITE: ORDER CANCELLATION, ITEM REMOVAL & SALES ISOLATION');
  console.log('===============================================================\n');

  try {
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(MONGO_URI);
    }

    const testRestaurantId = new mongoose.Types.ObjectId();

    // Setup dummy Restaurant tenant for tax calculation (5% taxRate)
    await Restaurant.deleteMany({ _id: testRestaurantId });
    const testRestaurant = new Restaurant({
      _id: testRestaurantId,
      name: 'Test Cafe Analytics Tenant',
      slug: `test-cafe-${Date.now()}`,
      address: '127 Cafe St',
      contact: '9999999999',
      taxRate: 5,
    });
    await testRestaurant.save();

    // Create dummy Dishes
    const teaDish = new Dish({
      restaurantId: testRestaurantId,
      name: 'Masala Tea',
      price: 50,
      available: true,
      category: 'Beverages',
    });
    await teaDish.save();

    const friesDish = new Dish({
      restaurantId: testRestaurantId,
      name: 'French Fries',
      price: 120,
      available: true,
      category: 'Snacks',
    });
    await friesDish.save();

    const sandwichDish = new Dish({
      restaurantId: testRestaurantId,
      name: 'Paneer Sandwich',
      price: 150,
      available: true,
      category: 'Snacks',
    });
    await sandwichDish.save();

    // Setup lightweight express app and middleware for route handler testing
    const app = express();
    app.use(express.json());
    app.use((req: any, res: any, next: any) => {
      req.user = { _id: new mongoose.Types.ObjectId().toString(), restaurantId: testRestaurantId.toString(), role: 'restaurant_admin' };
      next();
    });
    app.use('/api/orders', orderRoutes);
    app.use('/api/analytics', analyticsRoutes);

    // Helper to invoke route handler cleanly
    const callHandler = async (routerStack: any[], path: string, method: string, reqMock: any): Promise<any> => {
      const routeLayer = routerStack.find(
        (layer) => layer.route && layer.route.path === path && layer.route.methods[method.toLowerCase()]
      );
      if (!routeLayer) throw new Error(`Route not found for ${method} ${path}`);

      reqMock.headers = reqMock.headers || {};
      reqMock.user = reqMock.user || { _id: new mongoose.Types.ObjectId().toString(), restaurantId: testRestaurantId, role: 'restaurant_admin' };

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
    // TEST 1: Normal Order Creation & Order Cancellation Deactivates Table
    // ------------------------------------------------------------------------
    console.log('[Test 1] Order Cancellation deactivates TableSession & clears active state...');
    const table1Num = canonicalTableKey('T-CANCEL-1');
    await TableSession.deleteMany({ restaurantId: testRestaurantId, tableNumber: table1Num });
    await Order.deleteMany({ restaurantId: testRestaurantId, tableNumber: table1Num });

    const order1 = new Order({
      restaurantId: testRestaurantId,
      customerName: 'Customer One',
      phoneNumber: '9876543210',
      tableNumber: table1Num,
      items: [
        { dishId: teaDish._id, name: 'Masala Tea', price: 50, quantity: 2 },
        { dishId: sandwichDish._id, name: 'Paneer Sandwich', price: 150, quantity: 1 },
      ],
      status: 'received',
      subtotal: 250,
      tax: 12.5,
      totalAmount: 262.5,
    });
    await order1.save();

    const session1 = new TableSession({
      restaurantId: testRestaurantId,
      tableNumber: table1Num,
      status: 'active',
      customerName: 'Customer One',
      phoneNumber: '9876543210',
      orderId: order1._id,
    });
    await session1.save();
    order1.sessionId = session1._id as any;
    await order1.save();

    // Verify session is initially active
    let activeSession1 = await TableSession.findOne({ restaurantId: testRestaurantId, tableNumber: table1Num, status: { $in: ['active', 'grace'] } });
    if (!activeSession1) throw new Error('Test 1 Setup Error: Active session not found');

    // Cancel Order via PATCH /api/orders/:id/status
    const cancelReq: any = {
      params: { id: order1._id.toString() },
      body: { status: 'cancelled' },
      user: { restaurantId: testRestaurantId.toString() },
      app: { get: () => null },
    };

    const cancelRes = await callHandler(orderRoutes.stack, '/:id/status', 'PATCH', cancelReq);
    if (cancelRes.status !== 200 || !cancelRes.data.success) {
      throw new Error(`Test 1 Failed: Expected successful cancellation response, got ${JSON.stringify(cancelRes)}`);
    }

    const updatedOrder1 = await Order.findById(order1._id);
    if (updatedOrder1?.status !== 'cancelled') {
      throw new Error(`Test 1 Failed: Expected Order status to be 'cancelled', got '${updatedOrder1?.status}'`);
    }

    activeSession1 = await TableSession.findOne({ restaurantId: testRestaurantId, tableNumber: table1Num, status: { $in: ['active', 'grace'] } });
    if (activeSession1) {
      throw new Error('Test 1 Failed: TableSession remained active after order cancellation!');
    }

    console.log('  └─► PASS: Order cancelled and TableSession closed immediately!');

    // ------------------------------------------------------------------------
    // TEST 2: Item Quantity Reduction & Server-Side Total Recalculation
    // ------------------------------------------------------------------------
    console.log('[Test 2] Item Quantity Reduction & Server-Side Recalculation...');
    const table2Num = canonicalTableKey('T-REDUCE-2');
    await TableSession.deleteMany({ restaurantId: testRestaurantId, tableNumber: table2Num });
    await Order.deleteMany({ restaurantId: testRestaurantId, tableNumber: table2Num });

    const order2 = new Order({
      restaurantId: testRestaurantId,
      customerName: 'Customer Two',
      phoneNumber: '9876543211',
      tableNumber: table2Num,
      items: [
        { dishId: teaDish._id, name: 'Masala Tea', price: 50, quantity: 3 },
      ],
      status: 'accepted',
      subtotal: 150,
      tax: 7.5,
      totalAmount: 157.5,
    });
    await order2.save();

    const session2 = new TableSession({
      restaurantId: testRestaurantId,
      tableNumber: table2Num,
      status: 'active',
      orderId: order2._id,
    });
    await session2.save();

    const teaItemId = (order2.items[0] as any)._id.toString();

    // Decrease quantity from 3 to 2
    const decreaseReq: any = {
      params: { id: order2._id.toString() },
      body: { itemId: teaItemId, action: 'decrease' },
      user: { restaurantId: testRestaurantId.toString() },
      app: { get: () => null },
    };

    const decreaseRes = await callHandler(orderRoutes.stack, '/:id/items', 'PATCH', decreaseReq);
    if (decreaseRes.status !== 200 || !decreaseRes.data.success) {
      throw new Error(`Test 2 Failed: Expected 200 response on item decrease, got ${JSON.stringify(decreaseRes)}`);
    }

    const updatedOrder2 = decreaseRes.data.data;
    if (updatedOrder2.items[0].quantity !== 2) {
      throw new Error(`Test 2 Failed: Expected quantity 2, got ${updatedOrder2.items[0].quantity}`);
    }
    if (updatedOrder2.subtotal !== 100 || updatedOrder2.tax !== 5 || updatedOrder2.totalAmount !== 105) {
      throw new Error(`Test 2 Failed: Server total recalculation incorrect. Subtotal: ${updatedOrder2.subtotal}, Tax: ${updatedOrder2.tax}, Total: ${updatedOrder2.totalAmount}`);
    }

    console.log('  └─► PASS: Quantity decreased to 2 and totals recalculated to Subtotal 100, Tax 5, Total 105!');

    // ------------------------------------------------------------------------
    // TEST 3: Individual Item Removal
    // ------------------------------------------------------------------------
    console.log('[Test 3] Individual Item Removal from multi-item order...');
    const table3Num = canonicalTableKey('T-ITEM-3');
    const order3 = new Order({
      restaurantId: testRestaurantId,
      customerName: 'Customer Three',
      phoneNumber: '9876543212',
      tableNumber: table3Num,
      items: [
        { dishId: teaDish._id, name: 'Masala Tea', price: 50, quantity: 2 },
        { dishId: friesDish._id, name: 'French Fries', price: 120, quantity: 1 },
      ],
      status: 'accepted',
      subtotal: 220,
      tax: 11,
      totalAmount: 231,
    });
    await order3.save();

    const friesItemId = (order3.items[1] as any)._id.toString();

    const deleteReq: any = {
      params: { id: order3._id.toString(), itemId: friesItemId },
      body: { action: 'remove' },
      user: { restaurantId: testRestaurantId.toString() },
      app: { get: () => null },
    };

    const deleteRes = await callHandler(orderRoutes.stack, '/:id/items/:itemId', 'DELETE', deleteReq);
    if (deleteRes.status !== 200 || !deleteRes.data.success) {
      throw new Error(`Test 3 Failed: Item removal returned error: ${JSON.stringify(deleteRes)}`);
    }

    const updatedOrder3 = deleteRes.data.data;
    if (updatedOrder3.items.length !== 1 || updatedOrder3.items[0].name !== 'Masala Tea') {
      throw new Error(`Test 3 Failed: Fries item was not removed cleanly from order items`);
    }
    if (updatedOrder3.subtotal !== 100 || updatedOrder3.tax !== 5 || updatedOrder3.totalAmount !== 105) {
      throw new Error(`Test 3 Failed: Totals incorrect after removing item. Subtotal: ${updatedOrder3.subtotal}`);
    }

    console.log('  └─► PASS: French Fries removed cleanly. Order contains only Tea x 2 with Subtotal 100!');

    // ------------------------------------------------------------------------
    // TEST 4: Last Item Removal Auto-Cancels Order & Closes TableSession
    // ------------------------------------------------------------------------
    console.log('[Test 4] Last Item Removal Auto-Cancels Order & Deactivates Table...');
    const table4Num = canonicalTableKey('T-LAST-4');
    await TableSession.deleteMany({ restaurantId: testRestaurantId, tableNumber: table4Num });
    await Order.deleteMany({ restaurantId: testRestaurantId, tableNumber: table4Num });

    const order4 = new Order({
      restaurantId: testRestaurantId,
      customerName: 'Customer Four',
      phoneNumber: '9876543213',
      tableNumber: table4Num,
      items: [
        { dishId: friesDish._id, name: 'French Fries', price: 120, quantity: 1 },
      ],
      status: 'accepted',
      subtotal: 120,
      tax: 6,
      totalAmount: 126,
    });
    await order4.save();

    const session4 = new TableSession({
      restaurantId: testRestaurantId,
      tableNumber: table4Num,
      status: 'active',
      orderId: order4._id,
    });
    await session4.save();
    order4.sessionId = session4._id as any;
    await order4.save();

    const lastItemId = (order4.items[0] as any)._id.toString();

    const removeLastReq: any = {
      params: { id: order4._id.toString(), itemId: lastItemId },
      body: { action: 'remove' },
      user: { restaurantId: testRestaurantId.toString() },
      app: { get: () => null },
    };

    const removeLastRes = await callHandler(orderRoutes.stack, '/:id/items/:itemId', 'DELETE', removeLastReq);
    if (removeLastRes.status !== 200 || !removeLastRes.data.orderCancelled) {
      throw new Error(`Test 4 Failed: Expected orderCancelled to be true on last item removal, got ${JSON.stringify(removeLastRes)}`);
    }

    const updatedOrder4 = await Order.findById(order4._id);
    if (updatedOrder4?.status !== 'cancelled' || updatedOrder4?.items.length !== 0) {
      throw new Error(`Test 4 Failed: Expected Order status to be 'cancelled' with 0 items`);
    }

    const activeSession4 = await TableSession.findOne({ restaurantId: testRestaurantId, tableNumber: table4Num, status: { $in: ['active', 'grace'] } });
    if (activeSession4) {
      throw new Error('Test 4 Failed: TableSession remained active after removing last item!');
    }

    console.log('  └─► PASS: Last item removed. Order set to cancelled and TableSession closed!');

    // ------------------------------------------------------------------------
    // TEST 5: Payment Safety (Block modification/cancellation on finalized bills)
    // ------------------------------------------------------------------------
    console.log('[Test 5] Payment Safety: Block modification/cancellation on finalized bills...');
    const table5Num = canonicalTableKey('T-PAID-5');
    const order5 = new Order({
      restaurantId: testRestaurantId,
      customerName: 'Customer Five',
      phoneNumber: '9876543214',
      tableNumber: table5Num,
      items: [{ dishId: sandwichDish._id, name: 'Paneer Sandwich', price: 150, quantity: 1 }],
      status: 'completed',
      subtotal: 150,
      tax: 7.5,
      totalAmount: 157.5,
    });
    await order5.save();

    const bill5 = new Bill({
      billNumber: `INV-TEST-${Date.now()}`,
      restaurantId: testRestaurantId,
      orderId: order5._id,
      subtotal: 150,
      tax: 7.5,
      totalAmount: 157.5,
      paymentStatus: 'paid',
      paymentMethod: 'cash',
    });
    await bill5.save();

    // Attempt cancellation on paid bill
    const tryCancelReq: any = {
      params: { id: order5._id.toString() },
      body: { status: 'cancelled' },
      user: { restaurantId: testRestaurantId.toString() },
      app: { get: () => null },
    };

    const tryCancelRes = await callHandler(orderRoutes.stack, '/:id/status', 'PATCH', tryCancelReq);
    if (tryCancelRes.status !== 400 || !tryCancelRes.data.message.includes('finalized')) {
      throw new Error(`Test 5 Failed: System allowed cancellation of paid bill! Response: ${JSON.stringify(tryCancelRes)}`);
    }

    console.log('  └─► PASS: Safely blocked cancellation of finalized paid bill with 400 error!');

    // ------------------------------------------------------------------------
    // TEST 6: MANDATORY FINANCIAL AUDIT TEST: Cancelled Orders Must NOT Appear In Daily Sales
    // ------------------------------------------------------------------------
    console.log('[Test 6] MANDATORY FINANCIAL AUDIT: Cancelled Order MUST NOT appear in Daily Sales Report...');

    // Clean up any prior test orders/bills for this restaurant to test exact range isolation
    await Order.deleteMany({ restaurantId: testRestaurantId });
    await Bill.deleteMany({ restaurantId: testRestaurantId });

    // A. Create multi-item order and cancel it
    const todayStr = new Date().toISOString().split('T')[0];
    const auditTableNum = canonicalTableKey('T-AUDIT-6');

    const cancelledOrder = new Order({
      restaurantId: testRestaurantId,
      customerName: 'Cancelled Guest',
      phoneNumber: '9999000111',
      tableNumber: auditTableNum,
      items: [
        { dishId: teaDish._id, name: 'Masala Tea', price: 50, quantity: 2 },
        { dishId: sandwichDish._id, name: 'Paneer Sandwich', price: 150, quantity: 1 },
      ],
      status: 'cancelled',
      subtotal: 250,
      tax: 12.5,
      totalAmount: 262.5,
    });
    await cancelledOrder.save();

    const voidBill = new Bill({
      billNumber: `INV-VOID-${Date.now()}`,
      restaurantId: testRestaurantId,
      orderId: cancelledOrder._id,
      subtotal: 250,
      tax: 12.5,
      totalAmount: 262.5,
      paymentStatus: 'void',
      voidNote: 'Order cancelled by staff',
    });
    await voidBill.save();

    // B. Create a legitimate finalized paid order on same business date
    const legitOrder = new Order({
      restaurantId: testRestaurantId,
      customerName: 'Legit Guest',
      phoneNumber: '9999000222',
      tableNumber: auditTableNum,
      items: [
        { dishId: friesDish._id, name: 'French Fries', price: 120, quantity: 1 },
      ],
      status: 'completed',
      subtotal: 120,
      tax: 6,
      totalAmount: 126,
    });
    await legitOrder.save();

    const paidBill = new Bill({
      billNumber: `INV-LEGIT-${Date.now()}`,
      restaurantId: testRestaurantId,
      orderId: legitOrder._id,
      subtotal: 120,
      tax: 6,
      totalAmount: 126,
      paymentStatus: 'paid',
      paymentMethod: 'cash',
    });
    await paidBill.save();

    // C. Query /api/analytics/daily-sales for today's date
    const dailySalesReq: any = {
      query: { date: todayStr },
      user: { restaurantId: testRestaurantId.toString() },
    };

    const dailySalesRes = await callHandler(analyticsRoutes.stack, '/daily-sales', 'GET', dailySalesReq);
    if (dailySalesRes.status !== 200 || !dailySalesRes.data.success) {
      throw new Error(`Test 6 Failed: Daily Sales request failed: ${JSON.stringify(dailySalesRes)}`);
    }

    const reportData = dailySalesRes.data.data;

    // D. Verify Financial Isolation
    if (reportData.summary.netSales !== 126) {
      throw new Error(`Test 6 Failed: Net Sales expected 126 (legit sale only), got ${reportData.summary.netSales}! Cancelled order leaked into Net Sales.`);
    }

    if (reportData.summary.grossSales !== 120) {
      throw new Error(`Test 6 Failed: Gross Sales expected 120, got ${reportData.summary.grossSales}! Cancelled order leaked into Gross Sales.`);
    }

    if (reportData.summary.taxes !== 6) {
      throw new Error(`Test 6 Failed: Taxes expected 6, got ${reportData.summary.taxes}! Cancelled order leaked into Taxes.`);
    }

    if (reportData.summary.totalOrders !== 1) {
      throw new Error(`Test 6 Failed: Sales Total Orders count expected 1, got ${reportData.summary.totalOrders}! Cancelled order counted as a sale.`);
    }

    // Verify item-wise particulars contain ONLY French Fries x 1 (legit sale) and NO Masala Tea or Paneer Sandwich
    const itemNames = reportData.items.map((i: any) => i.name);
    if (itemNames.includes('Masala Tea') || itemNames.includes('Paneer Sandwich')) {
      throw new Error(`Test 6 Failed: Cancelled order items (${itemNames.join(', ')}) appeared in Item-wise Sales particulars!`);
    }

    if (!itemNames.includes('French Fries')) {
      throw new Error(`Test 6 Failed: Legitimate sale item 'French Fries' missing from report`);
    }

    console.log('  └─► PASS: Financial isolation verified 100%! Cancelled order has ZERO contribution to Net Sales (126), Gross Sales (120), Taxes (6), or Item Sales!');

    // Cleanup Test Data
    await Restaurant.deleteMany({ _id: testRestaurantId });
    await Dish.deleteMany({ restaurantId: testRestaurantId });
    await Order.deleteMany({ restaurantId: testRestaurantId });
    await TableSession.deleteMany({ restaurantId: testRestaurantId });
    await Bill.deleteMany({ restaurantId: testRestaurantId });

    console.log('\n===============================================================');
    console.log('ALL PRODUCTION TESTS PASSED 100% (CANCELLATION, REMOVAL, SALES ISOLATION)');
    console.log('===============================================================\n');
  } catch (err: any) {
    console.error('\n❌ TEST SUITE FAILURE:', err.message);
    process.exit(1);
  }
}

if (require.main === module) {
  runCancellationAndItemRemovalTests().then(() => process.exit(0));
}
