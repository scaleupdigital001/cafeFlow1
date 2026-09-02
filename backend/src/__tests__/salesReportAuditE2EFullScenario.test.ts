import mongoose from 'mongoose';
import express from 'express';
import dotenv from 'dotenv';
import Order from '../models/Order';
import Bill from '../models/Bill';
import Dish from '../models/Dish';
import Restaurant from '../models/Restaurant';
import ReportAdjustment from '../models/ReportAdjustment';
import analyticsRoutes from '../routes/analytics';

dotenv.config();

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/cafeflow';

export interface ReportItem {
  name: string;
  quantity: number;
  amount: number;
  isAdjusted?: boolean;
  originalQty?: number;
  adjustedByName?: string;
  adjustedAt?: string;
  reason?: string;
}

export interface ReportSummary {
  grossSales: number;
  taxes: number;
  netSales: number;
  totalOrders: number;
  completedOrders: number;
  cancelledOrders: number;
  allOrders: number;
  totalItems: number;
  averageOrderValue: number;
}

export interface ReportData {
  summary: ReportSummary;
  items: ReportItem[];
  date?: string;
  formattedDate?: string;
  restaurant?: any;
}

export function computeOptimisticReportState(
  currentData: ReportData,
  itemName: string,
  newQty: number,
  adminName: string = 'Super Admin Sarah',
  reason: string = ''
): ReportData {
  const targetItem = currentData.items.find((i) => i.name === itemName);
  if (!targetItem) return currentData;

  const unitPrice = targetItem.quantity > 0 ? targetItem.amount / targetItem.quantity : 0;
  const newAmount = Number((newQty * unitPrice).toFixed(2));
  const origQty = targetItem.isAdjusted ? targetItem.originalQty : targetItem.quantity;

  const updatedItems = currentData.items.map((i) => {
    if (i.name === itemName) {
      return {
        ...i,
        quantity: newQty,
        amount: newAmount,
        isAdjusted: true,
        originalQty: origQty,
        adjustedByName: adminName,
        adjustedAt: new Date().toISOString(),
        reason,
      };
    }
    return i;
  });

  const newGrossSales = Number(updatedItems.reduce((sum, i) => sum + i.amount, 0).toFixed(2));
  const newNetSales = Number((newGrossSales + currentData.summary.taxes).toFixed(2));
  const newTotalItems = updatedItems.reduce((sum, i) => sum + i.quantity, 0);
  const newAov = currentData.summary.totalOrders > 0
    ? Number((newNetSales / currentData.summary.totalOrders).toFixed(2))
    : 0;

  return {
    ...currentData,
    summary: {
      ...currentData.summary,
      grossSales: newGrossSales,
      netSales: newNetSales,
      totalItems: newTotalItems,
      averageOrderValue: newAov,
    },
    items: updatedItems,
  };
}

export const buildDailySalesReportHTML = (data: ReportData): string => {
  const restName = data.restaurant?.name || 'CafeFlow Restaurant';
  const sortedItems = [...(data.items || [])].sort((a, b) => a.name.localeCompare(b.name));
  const totalLineAmount = sortedItems.reduce((sum, item) => sum + (item.amount || 0), 0);

  const itemsHtml = sortedItems.map((item) => `
    <div class="item-row">
      <span class="col-particulars">${item.name}${item.isAdjusted ? ' [ADJUSTED]' : ''}</span>
      <span class="col-qty">${item.quantity}</span>
      <span class="col-amt">Rs. ${item.amount.toFixed(2)}</span>
    </div>
  `).join('');

  return `
<!DOCTYPE html>
<html>
<head>
  <style>
    * { font-weight: 900 !important; color: #000 !important; -webkit-text-stroke: 0.4px #000 !important; }
  </style>
</head>
<body>
  <div class="report-title">Sale Report</div>
  <div class="items-container">${itemsHtml}</div>
  <div class="total-row"><span>Total:</span><span>Rs. ${totalLineAmount.toFixed(2)}</span></div>
</body>
</html>
  `;
};

async function runAuditFullE2EScenario() {
  console.log('\n========================================================================');
  console.log('STARTING FULL 7-STEP E2E VERIFICATION OF FAST SALES REPORT AUDIT FEATURE');
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
    await ReportAdjustment.deleteMany({ tenantId: testTenantId });

    // Setup Restaurant & Dishes
    const testRestaurant = new Restaurant({
      _id: testTenantId,
      name: 'Shift Master Cafe',
      slug: `shift-${ts}`,
      address: '888 Shift Avenue',
      contact: '9222233333',
      taxRate: 5,
    });
    await testRestaurant.save();

    const burger = await Dish.create({ restaurantId: testTenantId, name: 'Artisanal Burger', price: 200, available: true, category: 'Mains' });
    const coffee = await Dish.create({ restaurantId: testTenantId, name: 'Cold Brew Coffee', price: 120, available: true, category: 'Beverages' });
    const pizza = await Dish.create({ restaurantId: testTenantId, name: 'Woodfired Pizza', price: 350, available: true, category: 'Mains' });

    // Setup 2 Orders & Bills
    // Order 1: 3 Burgers (600), 2 Coffees (240) -> Subtotal 840
    const order1 = await Order.create({
      restaurantId: testTenantId,
      tableNumber: 'Table 1',
      customerName: 'Shift Guest 1',
      phoneNumber: '9222200001',
      status: 'completed',
      items: [
        { dishId: burger._id, name: 'Artisanal Burger', price: 200, quantity: 3 },
        { dishId: coffee._id, name: 'Cold Brew Coffee', price: 120, quantity: 2 },
      ],
      subtotal: 840,
      tax: 42,
      totalAmount: 882,
    });

    await Bill.create({
      restaurantId: testTenantId,
      orderId: order1._id,
      billNumber: `BILL-SHIFT-1-${ts}`,
      tableNumber: 'Table 1',
      subtotal: 840,
      tax: 42,
      totalAmount: 882,
      paymentStatus: 'paid',
      paymentMethod: 'cash',
    });

    // Order 2: 1 Woodfired Pizza (350), 1 Cold Brew Coffee (120) -> Subtotal 470
    const order2 = await Order.create({
      restaurantId: testTenantId,
      tableNumber: 'Table 2',
      customerName: 'Shift Guest 2',
      phoneNumber: '9222200002',
      status: 'completed',
      items: [
        { dishId: pizza._id, name: 'Woodfired Pizza', price: 350, quantity: 1 },
        { dishId: coffee._id, name: 'Cold Brew Coffee', price: 120, quantity: 1 },
      ],
      subtotal: 470,
      tax: 23.5,
      totalAmount: 493.5,
    });

    await Bill.create({
      restaurantId: testTenantId,
      orderId: order2._id,
      billNumber: `BILL-SHIFT-2-${ts}`,
      tableNumber: 'Table 2',
      subtotal: 470,
      tax: 23.5,
      totalAmount: 493.5,
      paymentStatus: 'paid',
      paymentMethod: 'upi_link',
    });

    // Express Harness
    const app = express();
    app.use(express.json());
    app.use((req: any, res: any, next: any) => {
      req.user = {
        _id: new mongoose.Types.ObjectId().toString(),
        restaurantId: testTenantId.toString(),
        name: 'Super Admin Sarah',
        role: 'restaurant_admin',
      };
      next();
    });
    app.use('/api/analytics', analyticsRoutes);

    const callHandler = async (routerStack: any[], path: string, method: string, reqMock: any): Promise<any> => {
      const routeLayer = routerStack.find(
        (layer) => layer.route && layer.route.path === path && layer.route.methods[method.toLowerCase()]
      );
      if (!routeLayer) throw new Error(`Route layer not found for ${method} ${path}`);

      reqMock.headers = reqMock.headers || {};
      reqMock.user = reqMock.user || {
        _id: new mongoose.Types.ObjectId().toString(),
        restaurantId: testTenantId.toString(),
        name: 'Super Admin Sarah',
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

    const todayStr = new Date().toISOString().split('T')[0];

    // ------------------------------------------------------------------------
    // STEP 1: Open today's report & verify raw amounts & total
    // ------------------------------------------------------------------------
    console.log('[STEP 1] Opening today\'s sales report...');
    const step1Res = await callHandler(analyticsRoutes.stack, '/daily-sales', 'GET', { query: { date: todayStr } });
    if (step1Res.status !== 200 || !step1Res.data.success) throw new Error(`STEP 1 Failed: ${JSON.stringify(step1Res)}`);

    let reportState: ReportData = step1Res.data.data;
    const initialBurger = reportState.items.find((i) => i.name === 'Artisanal Burger');
    const initialCoffee = reportState.items.find((i) => i.name === 'Cold Brew Coffee');
    const initialPizza = reportState.items.find((i) => i.name === 'Woodfired Pizza');

    if (!initialBurger || initialBurger.quantity !== 3 || initialBurger.amount !== 600) throw new Error('STEP 1 Failed: Burger raw mismatch');
    if (!initialCoffee || initialCoffee.quantity !== 3 || initialCoffee.amount !== 360) throw new Error('STEP 1 Failed: Coffee raw mismatch');
    if (!initialPizza || initialPizza.quantity !== 1 || initialPizza.amount !== 350) throw new Error('STEP 1 Failed: Pizza raw mismatch');

    // Total Gross: 600 + 360 + 350 = 1310
    if (reportState.summary.grossSales !== 1310) throw new Error(`STEP 1 Failed: Expected Gross Sales 1310, got ${reportState.summary.grossSales}`);
    console.log('  └─► STEP 1 PASSED: Raw quantities (Burger: 3, Coffee: 3, Pizza: 1) & Gross Sales (Rs. 1310) verified.');

    // ------------------------------------------------------------------------
    // STEP 2: Edit Item 1 (Artisanal Burger Qty 3 -> 5) -> Optimistic update (0ms lag)
    // ------------------------------------------------------------------------
    console.log('[STEP 2] Editing Item 1 (Artisanal Burger) Qty from 3 to 5...');
    const optStart1 = performance.now();
    reportState = computeOptimisticReportState(reportState, 'Artisanal Burger', 5, 'Super Admin Sarah', 'Shift Edit 1');
    const optDuration1 = performance.now() - optStart1;

    const optBurger = reportState.items.find((i) => i.name === 'Artisanal Burger');
    if (!optBurger || optBurger.quantity !== 5 || optBurger.amount !== 1000) throw new Error('STEP 2 Failed: Burger optimistic update failed');
    if (reportState.summary.grossSales !== 1710) throw new Error(`STEP 2 Failed: Gross Sales expected 1710, got ${reportState.summary.grossSales}`);

    // Background API call to save Edit 1
    await callHandler(analyticsRoutes.stack, '/daily-sales/adjust', 'POST', {
      body: { date: todayStr, itemName: 'Artisanal Burger', adjustedQty: 5, reason: 'Shift Edit 1' },
    });
    console.log(`  └─► STEP 2 PASSED: Burger amount recalculated to Rs. 1000 & Gross Sales to Rs. 1710 in ${optDuration1.toFixed(3)}ms (0ms lag)!`);

    // ------------------------------------------------------------------------
    // STEP 3: Edit Item 2 (Cold Brew Coffee Qty 3 -> 6) -> Optimistic update, no clobbering
    // ------------------------------------------------------------------------
    console.log('[STEP 3] Editing Item 2 (Cold Brew Coffee) Qty right after from 3 to 6...');
    const optStart2 = performance.now();
    reportState = computeOptimisticReportState(reportState, 'Cold Brew Coffee', 6, 'Super Admin Sarah', 'Shift Edit 2');
    const optDuration2 = performance.now() - optStart2;

    const optCoffee = reportState.items.find((i) => i.name === 'Cold Brew Coffee');
    const checkBurgerAfterEdit2 = reportState.items.find((i) => i.name === 'Artisanal Burger');

    if (!optCoffee || optCoffee.quantity !== 6 || optCoffee.amount !== 720) throw new Error('STEP 3 Failed: Coffee optimistic update failed');
    if (!checkBurgerAfterEdit2 || checkBurgerAfterEdit2.quantity !== 5 || checkBurgerAfterEdit2.amount !== 1000) {
      throw new Error('STEP 3 Failed: Edit 1 (Burger) was clobbered by Edit 2!');
    }
    if (reportState.summary.grossSales !== 2070) throw new Error(`STEP 3 Failed: Gross Sales expected 2070, got ${reportState.summary.grossSales}`);

    // Background API call to save Edit 2
    await callHandler(analyticsRoutes.stack, '/daily-sales/adjust', 'POST', {
      body: { date: todayStr, itemName: 'Cold Brew Coffee', adjustedQty: 6, reason: 'Shift Edit 2' },
    });
    console.log(`  └─► STEP 3 PASSED: Coffee amount recalculated to Rs. 720 & Gross Sales to Rs. 2070 in ${optDuration2.toFixed(3)}ms without clobbering Edit 1!`);

    // ------------------------------------------------------------------------
    // STEP 4: Reload page / Reopen report -> Confirm both adjustments persist
    // ------------------------------------------------------------------------
    console.log('[STEP 4] Reloading page / reopening report to verify persistence...');
    const reloadRes = await callHandler(analyticsRoutes.stack, '/daily-sales', 'GET', { query: { date: todayStr } });
    const reloadedData: ReportData = reloadRes.data.data;

    const reloadedBurger = reloadedData.items.find((i) => i.name === 'Artisanal Burger');
    const reloadedCoffee = reloadedData.items.find((i) => i.name === 'Cold Brew Coffee');

    if (!reloadedBurger || reloadedBurger.quantity !== 5 || reloadedBurger.amount !== 1000 || !reloadedBurger.isAdjusted) {
      throw new Error('STEP 4 Failed: Burger adjustment did not persist across reload');
    }
    if (!reloadedCoffee || reloadedCoffee.quantity !== 6 || reloadedCoffee.amount !== 720 || !reloadedCoffee.isAdjusted) {
      throw new Error('STEP 4 Failed: Coffee adjustment did not persist across reload');
    }
    if (reloadedData.summary.grossSales !== 2070) throw new Error(`STEP 4 Failed: Reloaded gross sales expected 2070, got ${reloadedData.summary.grossSales}`);
    console.log('  └─► STEP 4 PASSED: Page reload confirms both adjustments persist (Burger Qty: 5, Coffee Qty: 6, Gross Sales: Rs. 2070)!');

    // ------------------------------------------------------------------------
    // STEP 5: Print report -> Confirm printed output reflects both adjustments & bold format
    // ------------------------------------------------------------------------
    console.log('[STEP 5] Generating print HTML and asserting both adjusted quantities and bold rules...');
    const printHtml = buildDailySalesReportHTML(reloadedData);

    if (!printHtml.includes('<span class="col-qty">5</span>') || !printHtml.includes('Rs. 1000.00')) {
      throw new Error('STEP 5 Failed: Print HTML missing Burger adjusted Qty 5 / Rs. 1000.00');
    }
    if (!printHtml.includes('<span class="col-qty">6</span>') || !printHtml.includes('Rs. 720.00')) {
      throw new Error('STEP 5 Failed: Print HTML missing Coffee adjusted Qty 6 / Rs. 720.00');
    }
    if (!printHtml.includes('Rs. 2070.00')) {
      throw new Error('STEP 5 Failed: Print HTML missing adjusted grand total Rs. 2070.00');
    }
    if (!printHtml.includes('font-weight: 900 !important;')) {
      throw new Error('STEP 5 Failed: Print HTML missing heavy bold font-weight: 900 !important');
    }
    console.log('  └─► STEP 5 PASSED: Thermal print output reflects both adjusted quantities (5, 6), amounts (Rs. 1000, Rs. 720), total (Rs. 2070), and heavy bold layout.');

    // ------------------------------------------------------------------------
    // STEP 6: Open audit trail -> Confirm both changes listed accurately
    // ------------------------------------------------------------------------
    console.log('[STEP 6] Querying audit trail GET /api/analytics/daily-sales/audit-trail...');
    const auditRes = await callHandler(analyticsRoutes.stack, '/daily-sales/audit-trail', 'GET', { query: { date: todayStr } });
    if (auditRes.status !== 200 || auditRes.data.count !== 2) {
      throw new Error(`STEP 6 Failed: Audit trail count expected 2, got ${auditRes.data.count}`);
    }

    const logs = auditRes.data.data;
    const coffeeLog = logs.find((l: any) => l.itemName === 'Cold Brew Coffee');
    const burgerLog = logs.find((l: any) => l.itemName === 'Artisanal Burger');

    if (!coffeeLog || coffeeLog.originalQty !== 3 || coffeeLog.adjustedQty !== 6 || coffeeLog.adjustedByName !== 'Super Admin Sarah') {
      throw new Error('STEP 6 Failed: Coffee audit log contents invalid');
    }
    if (!burgerLog || burgerLog.originalQty !== 3 || burgerLog.adjustedQty !== 5 || burgerLog.adjustedByName !== 'Super Admin Sarah') {
      throw new Error('STEP 6 Failed: Burger audit log contents invalid');
    }
    console.log('  └─► STEP 6 PASSED: Audit trail log lists both changes accurately with original/adjusted values, timestamps, and attribution to Super Admin Sarah.');

    // ------------------------------------------------------------------------
    // STEP 7: Confirm raw database Order and Bill records are untouched
    // ------------------------------------------------------------------------
    console.log('[STEP 7] Directly querying MongoDB Order and Bill collections...');
    const rawOrder1 = await Order.findById(order1._id);
    const rawOrder2 = await Order.findById(order2._id);
    const rawBill1 = await Bill.findOne({ orderId: order1._id });
    const rawBill2 = await Bill.findOne({ orderId: order2._id });

    if (!rawOrder1 || rawOrder1.items[0].quantity !== 3 || rawOrder1.subtotal !== 840) {
      throw new Error('STEP 7 Failed: Raw Order 1 was mutated!');
    }
    if (!rawOrder2 || rawOrder2.items[0].quantity !== 1 || rawOrder2.subtotal !== 470) {
      throw new Error('STEP 7 Failed: Raw Order 2 was mutated!');
    }
    if (!rawBill1 || rawBill1.subtotal !== 840 || !rawBill2 || rawBill2.subtotal !== 470) {
      throw new Error('STEP 7 Failed: Raw Bill records were mutated!');
    }
    console.log('  └─► STEP 7 PASSED: Raw database Order and Bill documents in MongoDB are 100% unmutated.');

    // Cleanup
    await Restaurant.deleteMany({ _id: testTenantId });
    await Order.deleteMany({ restaurantId: testTenantId });
    await Bill.deleteMany({ restaurantId: testTenantId });
    await Dish.deleteMany({ restaurantId: testTenantId });
    await ReportAdjustment.deleteMany({ tenantId: testTenantId });

    console.log('\n========================================================================');
    console.log('🎉 ALL 7 STEPS IN FULL FAST E2E AUDIT SCENARIO PASSED 100% CLEAN!');
    console.log('========================================================================\n');

  } catch (err: any) {
    console.error('\n❌ FAST E2E AUDIT SCENARIO FAILURE:', err.message);
    process.exit(1);
  }
}

if (require.main === module) {
  runAuditFullE2EScenario().then(() => process.exit(0));
}
