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

export interface DailySalesReportData {
  date?: string;
  formattedDate?: string;
  generatedAt?: string;
  restaurant: {
    name: string;
    address?: string;
    contact?: string;
    gstNumber?: string;
    taxRate?: number;
  };
  summary: {
    grossSales: number;
    taxes: number;
    taxRate?: number;
    netSales: number;
    totalOrders: number;
    completedOrders: number;
    cancelledOrders: number;
    allOrders: number;
    totalItems: number;
    averageOrderValue: number;
  };
  items: {
    name: string;
    quantity: number;
    amount: number;
    isAdjusted?: boolean;
    originalQty?: number;
    adjustedByName?: string;
    adjustedAt?: string;
    reason?: string;
  }[];
  payments: {
    method: string;
    label: string;
    count: number;
    amount: number;
  }[];
  adjustments?: any[];
  restaurantName?: string;
  startDate?: string;
  endDate?: string;
  totalOrders?: number;
  totalRevenue?: number;
  totalTax?: number;
}

export const formatDateToDDMMMYYYY = (dateInput?: string | Date): string => {
  const d = dateInput ? new Date(dateInput) : new Date();
  if (isNaN(d.getTime())) return new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  const day = String(d.getDate()).padStart(2, '0');
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const month = months[d.getMonth()];
  const year = d.getFullYear();
  return `${day} ${month} ${year}`;
};

export const formatReportDateRangeText = (data: DailySalesReportData): string => {
  if (data.startDate && data.endDate) {
    return `${formatDateToDDMMMYYYY(data.startDate)} to ${formatDateToDDMMMYYYY(data.endDate)}`;
  }
  const dateStr = data.date || data.formattedDate || new Date().toISOString().split('T')[0];
  const formatted = formatDateToDDMMMYYYY(dateStr);
  return `${formatted} to ${formatted}`;
};

export const formatFooterPrintTimestamp = (d: Date = new Date()): string => {
  const day = String(d.getDate()).padStart(2, '0');
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const month = months[d.getMonth()];
  const year = d.getFullYear();
  const hours = String(d.getHours()).padStart(2, '0');
  const mins = String(d.getMinutes()).padStart(2, '0');
  return `${day}-${month}-${year}, ${hours}:${mins}`;
};

export const buildDailySalesReportHTML = (data: DailySalesReportData): string => {
  const restName = data.restaurant?.name || data.restaurantName || 'CafeFlow Restaurant';
  const dateRangeText = formatReportDateRangeText(data);
  const timestampText = formatFooterPrintTimestamp();

  const cleanDateStr = (data.date || new Date().toISOString().slice(0, 10)).replace(/-/g, '');
  const sequenceNumber = `SEQ-${cleanDateStr}-0001`;

  const sortedItems = [...(data.items || [])].sort((a, b) => a.name.localeCompare(b.name));
  const totalLineAmount = sortedItems.reduce((sum, item) => sum + (item.amount || 0), 0);

  const itemsHtml = sortedItems.map((item) => `
    <div class="item-row">
      <span class="col-particulars">${item.name}${item.isAdjusted ? ' <small style="font-size:10px; font-weight:900;">[ADJUSTED]</small>' : ''}</span>
      <span class="col-qty">${item.quantity}</span>
      <span class="col-amt">Rs. ${item.amount.toFixed(2)}</span>
    </div>
  `).join('');

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Sale Report - ${dateRangeText}</title>
  <style>
    @page { size: 80mm auto; margin: 2mm 2mm; }
    @media print {
      html, body { width: 76mm !important; max-width: 76mm !important; margin: 0 auto !important; padding: 1mm 1mm !important; }
    }
    * {
      box-sizing: border-box; margin: 0; padding: 0;
      font-family: Arial, "Helvetica Neue", Helvetica, sans-serif !important;
      font-weight: 900 !important; color: #000 !important;
      -webkit-font-smoothing: none !important; -webkit-text-stroke: 0.4px #000 !important;
      text-rendering: optimizeLegibility !important;
    }
    html, body, div, span, p, h1, h2, h3, header, footer {
      font-weight: 900 !important; color: #000 !important; -webkit-text-stroke: 0.4px #000 !important;
    }
    body { width: 78mm; max-width: 100%; margin: 0 auto; padding: 3mm 2mm; background: #fff; }
    .header-box { text-align: center; margin-bottom: 6px; padding-bottom: 4px; border-bottom: 2px solid #000; }
    .restaurant-title { font-size: 15px; font-weight: 900 !important; text-transform: uppercase; }
    .report-title { font-size: 18px; font-weight: 900 !important; text-transform: uppercase; letter-spacing: 0.5px; margin: 2px 0; }
    .date-range-text { font-size: 12.5px; font-weight: 900 !important; }
    .table-header-row { display: flex; justify-content: space-between; font-size: 13px; font-weight: 900 !important; border-top: 2px solid #000; border-bottom: 2px solid #000; padding: 4px 0; margin: 6px 0 4px 0; text-transform: uppercase; }
    .item-row { display: flex; justify-content: space-between; font-size: 12.5px; font-weight: 900 !important; padding: 4px 0; border-bottom: 1px dashed #666; }
    .col-particulars { flex: 1; padding-right: 6px; font-weight: 900 !important; }
    .col-qty { width: 42px; text-align: center; font-weight: 900 !important; }
    .col-amt { width: 80px; text-align: right; font-weight: 900 !important; }
    .total-row { display: flex; justify-content: space-between; font-size: 15px; font-weight: 900 !important; border-top: 2px solid #000; border-bottom: 3px double #000; padding: 6px 0; margin: 8px 0 10px 0; text-transform: uppercase; }
    .footer-box { text-align: center; border-top: 1px dashed #000; padding-top: 6px; margin-top: 8px; font-size: 11px; font-weight: 900 !important; }
  </style>
</head>
<body>
  <div class="header-box">
    <div class="restaurant-title">${restName}</div>
    <div class="report-title">Sale Report</div>
    <div class="date-range-text">${dateRangeText}</div>
  </div>

  <div class="table-header-row">
    <span class="col-particulars">PARTICULARS</span>
    <span class="col-qty">QTY</span>
    <span class="col-amt">AMT</span>
  </div>

  <div class="items-container">
    ${itemsHtml}
  </div>

  <div class="total-row">
    <span>Total:</span>
    <span>Rs. ${totalLineAmount.toFixed(2)}</span>
  </div>

  <div class="footer-box">
    <div class="footer-line">Printed: ${timestampText}</div>
    <div class="footer-line">Seq #: ${sequenceNumber}</div>
  </div>
</body>
</html>
  `;
};

async function runE2EFullScenario() {
  console.log('\n========================================================================');
  console.log('STARTING FULL END-TO-END VERIFICATION OF SALES REPORT FEATURE (STEPS 1-7)');
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

    // Setup Restaurant
    const testRestaurant = new Restaurant({
      _id: testTenantId,
      name: 'Grand Central Cafe',
      slug: `e2e-${ts}`,
      address: '777 E2E Plaza',
      contact: '9888899999',
      taxRate: 5,
    });
    await testRestaurant.save();

    // Setup Dishes
    const burger = await Dish.create({ restaurantId: testTenantId, name: 'Cheese Burger', price: 150, available: true, category: 'Mains' });
    const coffee = await Dish.create({ restaurantId: testTenantId, name: 'Cold Coffee', price: 80, available: true, category: 'Beverages' });
    const pizza = await Dish.create({ restaurantId: testTenantId, name: 'Margherita Pizza', price: 300, available: true, category: 'Mains' });

    // Setup 2 Orders & Bills for Today
    // Order A: 3 Cheese Burgers (450), 2 Cold Coffees (160) -> Subtotal 610
    const orderA = await Order.create({
      restaurantId: testTenantId,
      tableNumber: 'Table 5',
      customerName: 'Alice',
      phoneNumber: '9000000001',
      status: 'completed',
      items: [
        { dishId: burger._id, name: 'Cheese Burger', price: 150, quantity: 3 },
        { dishId: coffee._id, name: 'Cold Coffee', price: 80, quantity: 2 },
      ],
      subtotal: 610,
      tax: 30.5,
      totalAmount: 640.5,
    });

    await Bill.create({
      restaurantId: testTenantId,
      orderId: orderA._id,
      billNumber: `BILL-E2E-A-${ts}`,
      tableNumber: 'Table 5',
      subtotal: 610,
      tax: 30.5,
      totalAmount: 640.5,
      paymentStatus: 'paid',
      paymentMethod: 'cash',
    });

    // Order B: 1 Margherita Pizza (300), 2 Cold Coffees (160) -> Subtotal 460
    const orderB = await Order.create({
      restaurantId: testTenantId,
      orderNumber: 'ORD-E2E-B',
      tableNumber: 'Table 8',
      customerName: 'Bob',
      phoneNumber: '9000000002',
      status: 'completed',
      items: [
        { dishId: pizza._id, name: 'Margherita Pizza', price: 300, quantity: 1 },
        { dishId: coffee._id, name: 'Cold Coffee', price: 80, quantity: 2 },
      ],
      subtotal: 460,
      tax: 23,
      totalAmount: 483,
    });

    await Bill.create({
      restaurantId: testTenantId,
      orderId: orderB._id,
      billNumber: `BILL-E2E-B-${ts}`,
      tableNumber: 'Table 8',
      subtotal: 460,
      tax: 23,
      totalAmount: 483,
      paymentStatus: 'paid',
      paymentMethod: 'upi_link',
    });

    // Setup Express App Router Harness
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

    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

    // ------------------------------------------------------------------------
    // STEP 1: Generate/open sales report for today's date
    // ------------------------------------------------------------------------
    console.log('[STEP 1] Generating sales report for today date range...');
    const step1Res = await callHandler(analyticsRoutes.stack, '/daily-sales', 'GET', { query: { date: todayStr } });
    if (step1Res.status !== 200 || !step1Res.data.success) {
      throw new Error(`Step 1 Failed: GET /daily-sales error: ${JSON.stringify(step1Res)}`);
    }
    const initialReport: DailySalesReportData = step1Res.data.data;
    console.log('  └─► STEP 1 PASSED: Report generated successfully.');

    // ------------------------------------------------------------------------
    // STEP 2: Confirm on-screen view shows correct per-item qty/amount & grand total
    // ------------------------------------------------------------------------
    console.log('[STEP 2] Confirming on-screen view per-item qty, amounts, and grand total...');
    const itemMap = new Map(initialReport.items.map((i) => [i.name, i]));

    const cheeseBurger = itemMap.get('Cheese Burger');
    const coldCoffee = itemMap.get('Cold Coffee');
    const margheritaPizza = itemMap.get('Margherita Pizza');

    if (!cheeseBurger || cheeseBurger.quantity !== 3 || cheeseBurger.amount !== 450) {
      throw new Error(`Step 2 Failed: Cheese Burger mismatch! ${JSON.stringify(cheeseBurger)}`);
    }
    if (!coldCoffee || coldCoffee.quantity !== 4 || coldCoffee.amount !== 320) { // 2 + 2 = 4 coffes @ 80 = 320
      throw new Error(`Step 2 Failed: Cold Coffee mismatch! ${JSON.stringify(coldCoffee)}`);
    }
    if (!margheritaPizza || margheritaPizza.quantity !== 1 || margheritaPizza.amount !== 300) {
      throw new Error(`Step 2 Failed: Margherita Pizza mismatch! ${JSON.stringify(margheritaPizza)}`);
    }

    // Grand total: 450 + 320 + 300 = 1070 Subtotal Gross Sales
    if (initialReport.summary.grossSales !== 1070) {
      throw new Error(`Step 2 Failed: Gross Sales mismatch! Expected 1070, got ${initialReport.summary.grossSales}`);
    }
    console.log('  └─► STEP 2 PASSED: Per-item quantities (Cheese Burger: 3, Cold Coffee: 4, Pizza: 1) and Grand Total (Rs. 1070) match 100%.');

    // ------------------------------------------------------------------------
    // STEP 3: Print report WITHOUT edits — verify parity, layout, and bold font enforcement
    // ------------------------------------------------------------------------
    console.log('[STEP 3] Printing initial unedited report and verifying layout/font rules...');
    const print1Html = buildDailySalesReportHTML(initialReport);

    // Verify Title & Date Range
    if (!print1Html.includes('Sale Report') || !print1Html.includes('to')) {
      throw new Error('Step 3 Failed: Print header missing "Sale Report" title or date range.');
    }
    // Verify Column Headers
    if (!print1Html.includes('PARTICULARS') || !print1Html.includes('QTY') || !print1Html.includes('AMT')) {
      throw new Error('Step 3 Failed: Print HTML missing PARTICULARS | QTY | AMT headers.');
    }
    // Verify Alphabetical Order: Cheese Burger -> Cold Coffee -> Margherita Pizza
    const idxBurger = print1Html.indexOf('Cheese Burger');
    const idxCoffee = print1Html.indexOf('Cold Coffee');
    const idxPizza = print1Html.indexOf('Margherita Pizza');
    if (!(idxBurger < idxCoffee && idxCoffee < idxPizza)) {
      throw new Error(`Step 3 Failed: Print items not in alphabetical order! Burger:${idxBurger}, Coffee:${idxCoffee}, Pizza:${idxPizza}`);
    }
    // Verify Line Amounts in Print HTML
    if (!print1Html.includes('Rs. 450.00') || !print1Html.includes('Rs. 320.00') || !print1Html.includes('Rs. 300.00')) {
      throw new Error('Step 3 Failed: Print HTML item line amounts mismatch.');
    }
    // Verify Grand Total in Print HTML (sum of line amounts = 1070)
    if (!print1Html.includes('Rs. 1070.00')) {
      throw new Error('Step 3 Failed: Print HTML grand total line amounts sum mismatch (Rs. 1070.00).');
    }
    // Verify Bold Font Enforcement
    if (!print1Html.includes('font-weight: 900 !important;')) {
      throw new Error('Step 3 Failed: Heavy bold font-weight: 900 !important missing from CSS.');
    }
    console.log('  └─► STEP 3 PASSED: Unedited print output matches screen quantities/amounts, alphabetical order, layout spec, and heavy bold enforcement.');

    // ------------------------------------------------------------------------
    // STEP 4: Edit Cold Coffee Qty from 4 to 6 & confirm recalculation & DB audit record
    // ------------------------------------------------------------------------
    console.log('[STEP 4] Admin audit edit: Editing "Cold Coffee" quantity from 4 to 6...');
    const adjustRes = await callHandler(analyticsRoutes.stack, '/daily-sales/adjust', 'POST', {
      body: {
        date: todayStr,
        itemName: 'Cold Coffee',
        adjustedQty: 6,
        reason: 'VIP Complimentary Refills',
      },
    });
    if (adjustRes.status !== 200 || !adjustRes.data.success) {
      throw new Error(`Step 4 Failed: POST /daily-sales/adjust failed: ${JSON.stringify(adjustRes)}`);
    }

    // Refetch report to verify screen recalculation
    const step4ReportRes = await callHandler(analyticsRoutes.stack, '/daily-sales', 'GET', { query: { date: todayStr } });
    const step4Report: DailySalesReportData = step4ReportRes.data.data;

    const editedCoffee = step4Report.items.find((i) => i.name === 'Cold Coffee');
    if (!editedCoffee || editedCoffee.quantity !== 6 || editedCoffee.amount !== 480) { // 6 x 80 = 480
      throw new Error(`Step 4 Failed: Recalculated Cold Coffee amount mismatch! Expected qty 6, amt 480. Got ${JSON.stringify(editedCoffee)}`);
    }

    // Recalculated Grand Total: 450 + 480 + 300 = 1230
    if (step4Report.summary.grossSales !== 1230) {
      throw new Error(`Step 4 Failed: Recalculated Gross Sales mismatch! Expected 1230, got ${step4Report.summary.grossSales}`);
    }

    // Verify DB Audit Adjustment Record
    const dbAdj = await ReportAdjustment.findOne({ tenantId: testTenantId, reportDate: todayStr, itemName: 'Cold Coffee' });
    if (!dbAdj || dbAdj.originalQty !== 4 || dbAdj.adjustedQty !== 6 || dbAdj.adjustedByName !== 'Super Admin Sarah') {
      throw new Error(`Step 4 Failed: DB ReportAdjustment record mismatch: ${JSON.stringify(dbAdj)}`);
    }
    console.log('  └─► STEP 4 PASSED: Cold Coffee amount recalculated to Rs. 480, Grand Total to Rs. 1230, and DB audit record created with admin attribution.');

    // ------------------------------------------------------------------------
    // STEP 5: Print report AGAIN — confirm printed output reflects ADJUSTED numbers & bold layout
    // ------------------------------------------------------------------------
    console.log('[STEP 5] Printing report again after edit and asserting adjusted values in print HTML...');
    const print2Html = buildDailySalesReportHTML(step4Report);

    if (!print2Html.includes('<span class="col-qty">6</span>')) {
      throw new Error('Step 5 Failed: Print HTML does NOT show adjusted quantity 6 for Cold Coffee!');
    }
    if (!print2Html.includes('Rs. 480.00')) {
      throw new Error('Step 5 Failed: Print HTML does NOT show adjusted line amount Rs. 480.00 for Cold Coffee!');
    }
    if (!print2Html.includes('Rs. 1230.00')) {
      throw new Error('Step 5 Failed: Print HTML does NOT show adjusted grand total sum Rs. 1230.00!');
    }
    if (!print2Html.includes('[ADJUSTED]')) {
      throw new Error('Step 5 Failed: Print HTML missing [ADJUSTED] badge!');
    }
    console.log('  └─► STEP 5 PASSED: Second print output reflects adjusted quantity 6, line amount Rs. 480.00, total Rs. 1230.00, and [ADJUSTED] badge.');

    // ------------------------------------------------------------------------
    // STEP 6: Confirm original raw order data was NOT mutated
    // ------------------------------------------------------------------------
    console.log('[STEP 6] Directly querying raw Order and Bill collections in MongoDB...');
    const rawOrderA = await Order.findById(orderA._id);
    const rawOrderB = await Order.findById(orderB._id);

    if (!rawOrderA || !rawOrderB) throw new Error('Step 6 Failed: Raw orders not found in DB.');

    const coffeeInA = rawOrderA.items.find((i) => i.name === 'Cold Coffee');
    const coffeeInB = rawOrderB.items.find((i) => i.name === 'Cold Coffee');

    if (!coffeeInA || coffeeInA.quantity !== 2) throw new Error(`Step 6 Failed: Raw Order A mutated! ${coffeeInA?.quantity}`);
    if (!coffeeInB || coffeeInB.quantity !== 2) throw new Error(`Step 6 Failed: Raw Order B mutated! ${coffeeInB?.quantity}`);

    if (rawOrderA.subtotal !== 610 || rawOrderB.subtotal !== 460) {
      throw new Error('Step 6 Failed: Raw order subtotals mutated!');
    }
    console.log('  └─► STEP 6 PASSED: Raw database Order documents remain 100% untouched (Order A qty 2, Order B qty 2).');

    // ------------------------------------------------------------------------
    // STEP 7: Confirm audit trail view shows the change accurately
    // ------------------------------------------------------------------------
    console.log('[STEP 7] Querying audit trail endpoint GET /api/analytics/daily-sales/audit-trail...');
    const auditRes = await callHandler(analyticsRoutes.stack, '/daily-sales/audit-trail', 'GET', { query: { date: todayStr } });

    if (auditRes.status !== 200 || !auditRes.data.success || auditRes.data.count !== 1) {
      throw new Error(`Step 7 Failed: Audit trail response invalid: ${JSON.stringify(auditRes)}`);
    }

    const logEntry = auditRes.data.data[0];
    if (logEntry.itemName !== 'Cold Coffee' || logEntry.originalQty !== 4 || logEntry.adjustedQty !== 6 || logEntry.adjustedByName !== 'Super Admin Sarah') {
      throw new Error(`Step 7 Failed: Audit log entry mismatch: ${JSON.stringify(logEntry)}`);
    }
    console.log('  └─► STEP 7 PASSED: Audit trail log correctly records Cold Coffee edit from 4 to 6 by Super Admin Sarah.');

    // Cleanup
    await Restaurant.deleteMany({ _id: testTenantId });
    await Order.deleteMany({ restaurantId: testTenantId });
    await Bill.deleteMany({ restaurantId: testTenantId });
    await Dish.deleteMany({ restaurantId: testTenantId });
    await ReportAdjustment.deleteMany({ tenantId: testTenantId });

    console.log('\n========================================================================');
    console.log('🎉 ALL 7 STEPS IN FULL E2E SCENARIO PASSED CLEANLY WITH ZERO FAILURES!');
    console.log('========================================================================\n');

  } catch (err: any) {
    console.error('\n❌ FULL E2E SCENARIO FAILURE:', err.message);
    process.exit(1);
  }
}

if (require.main === module) {
  runE2EFullScenario().then(() => process.exit(0));
}
