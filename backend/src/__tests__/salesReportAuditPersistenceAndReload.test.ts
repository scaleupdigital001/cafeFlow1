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

export const buildDailySalesReportHTML = (data: DailySalesReportData): string => {
  const restName = data.restaurant?.name || 'CafeFlow Restaurant';
  const dateStr = data.date || data.formattedDate || new Date().toISOString().split('T')[0];
  const dateFormatted = formatDateToDDMMMYYYY(dateStr);
  const dateRangeText = `${dateFormatted} to ${dateFormatted}`;

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
    * {
      box-sizing: border-box; margin: 0; padding: 0;
      font-family: Arial, sans-serif !important;
      font-weight: 900 !important; color: #000 !important;
      -webkit-text-stroke: 0.4px #000 !important;
    }
  </style>
</head>
<body>
  <div class="header-box">
    <div class="restaurant-title">${restName}</div>
    <div class="report-title">Sale Report</div>
    <div class="date-range-text">${dateRangeText}</div>
  </div>
  <div class="items-container">${itemsHtml}</div>
  <div class="total-row"><span>Total:</span><span>Rs. ${totalLineAmount.toFixed(2)}</span></div>
</body>
</html>
  `;
};

async function runAuditPersistenceSuite() {
  console.log('\n========================================================================');
  console.log('STARTING SALES REPORT AUDIT PERSISTENCE & RELOAD INTEGRATION SUITE');
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
      name: 'Persist & Audit Cafe',
      slug: `persist-${ts}`,
      address: '404 Persistence Highway',
      contact: '9666677777',
      taxRate: 5,
    });
    await testRestaurant.save();

    // Setup Dish & Order
    const teaDish = await Dish.create({
      restaurantId: testTenantId,
      name: 'Cutting Tea',
      price: 20,
      available: true,
      category: 'Beverages',
    });

    const order = await Order.create({
      restaurantId: testTenantId,
      tableNumber: 'Table 2',
      customerName: 'Tea Enthusiast',
      phoneNumber: '9666600001',
      status: 'completed',
      items: [{ dishId: teaDish._id, name: 'Cutting Tea', price: 20, quantity: 5 }],
      subtotal: 100,
      tax: 5,
      totalAmount: 105,
    });

    await Bill.create({
      restaurantId: testTenantId,
      orderId: order._id,
      billNumber: `BILL-PERSIST-${ts}`,
      tableNumber: 'Table 2',
      subtotal: 100,
      tax: 5,
      totalAmount: 105,
      paymentStatus: 'paid',
      paymentMethod: 'cash',
    });

    // Setup Express Harness
    const app = express();
    app.use(express.json());
    app.use((req: any, res: any, next: any) => {
      req.user = {
        _id: new mongoose.Types.ObjectId().toString(),
        restaurantId: testTenantId.toString(),
        name: 'Manager Alice',
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
        name: 'Manager Alice',
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
    // Step A: Fetch initial raw daily sales report
    // ------------------------------------------------------------------------
    console.log('[Step A] Fetching initial raw daily sales report...');
    const rawRes = await callHandler(analyticsRoutes.stack, '/daily-sales', 'GET', { query: { date: todayStr } });
    if (rawRes.status !== 200 || !rawRes.data.success) {
      throw new Error(`Step A Failed: ${JSON.stringify(rawRes)}`);
    }
    const initialTea = rawRes.data.data.items.find((i: any) => i.name === 'Cutting Tea');
    if (!initialTea || initialTea.quantity !== 5 || initialTea.amount !== 100) {
      throw new Error(`Step A Failed: Raw Cutting Tea mismatch! ${JSON.stringify(initialTea)}`);
    }
    console.log('  └─► Raw Cutting Tea Qty: 5, Amount: Rs. 100, Gross Sales: Rs. 100');

    // ------------------------------------------------------------------------
    // Step B: Save audit adjustment (Edit Qty 5 -> 10)
    // ------------------------------------------------------------------------
    console.log('[Step B] Executing audit edit: Changing Cutting Tea quantity from 5 to 10...');
    const adjustRes = await callHandler(analyticsRoutes.stack, '/daily-sales/adjust', 'POST', {
      body: {
        date: todayStr,
        itemName: 'Cutting Tea',
        adjustedQty: 10,
        reason: 'Catering bonus tea batch',
      },
    });

    if (adjustRes.status !== 200 || !adjustRes.data.success) {
      throw new Error(`Step B Failed: Adjustment endpoint error: ${JSON.stringify(adjustRes)}`);
    }
    console.log('  └─► Audit adjustment saved successfully!');

    // ------------------------------------------------------------------------
    // Step C: Simulate PAGE RELOAD / REOPEN REPORT -> Assert persistent adjusted numbers
    // ------------------------------------------------------------------------
    console.log('[Step C] Simulating page reload / reopening report for today...');
    const reloadedReportRes = await callHandler(analyticsRoutes.stack, '/daily-sales', 'GET', { query: { date: todayStr } });
    const reloadedData: DailySalesReportData = reloadedReportRes.data.data;

    const reloadedTea = reloadedData.items.find((i) => i.name === 'Cutting Tea');
    if (!reloadedTea || reloadedTea.quantity !== 10 || reloadedTea.amount !== 200 || !reloadedTea.isAdjusted) {
      throw new Error(`Step C Failed: Reloaded report did NOT show adjusted values! ${JSON.stringify(reloadedTea)}`);
    }

    if (reloadedData.summary.grossSales !== 200) {
      throw new Error(`Step C Failed: Reloaded report gross sales expected 200, got ${reloadedData.summary.grossSales}`);
    }
    console.log('  └─► STEP C PASSED: Page reload shows persistent adjusted Qty 10, Amount Rs. 200, and Gross Sales Rs. 200!');

    // ------------------------------------------------------------------------
    // Step D: Confirm raw Order/Bill records remain untouched
    // ------------------------------------------------------------------------
    console.log('[Step D] Directly asserting MongoDB Order & Bill documents are completely untouched...');
    const dbOrder = await Order.findById(order._id);
    const dbBill = await Bill.findOne({ orderId: order._id });

    if (!dbOrder || dbOrder.items[0].quantity !== 5 || dbOrder.subtotal !== 100) {
      throw new Error(`Step D Failed: Raw Order document was mutated! ${JSON.stringify(dbOrder)}`);
    }
    if (!dbBill || dbBill.subtotal !== 100) {
      throw new Error(`Step D Failed: Raw Bill document was mutated! ${JSON.stringify(dbBill)}`);
    }
    console.log('  └─► STEP D PASSED: Raw Order qty remains 5 & Bill subtotal remains Rs. 100 in MongoDB.');

    // ------------------------------------------------------------------------
    // Step E: Confirm print HTML reflects adjusted numbers
    // ------------------------------------------------------------------------
    console.log('[Step E] Printing report post-reload & asserting adjusted amounts in thermal print output...');
    const printHtml = buildDailySalesReportHTML(reloadedData);
    if (!printHtml.includes('<span class="col-qty">10</span>') || !printHtml.includes('Rs. 200.00')) {
      throw new Error('Step E Failed: Print HTML does not reflect adjusted Qty 10 / Amount Rs. 200.00');
    }
    if (!printHtml.includes('[ADJUSTED]')) {
      throw new Error('Step E Failed: Print HTML missing [ADJUSTED] badge!');
    }
    console.log('  └─► STEP E PASSED: Printed output matches adjustment (Qty: 10, Amount: Rs. 200.00, Badge: [ADJUSTED]).');

    // ------------------------------------------------------------------------
    // Step F: Confirm audit trail log records the change accurately
    // ------------------------------------------------------------------------
    console.log('[Step F] Querying GET /api/analytics/daily-sales/audit-trail...');
    const auditTrailRes = await callHandler(analyticsRoutes.stack, '/daily-sales/audit-trail', 'GET', { query: { date: todayStr } });
    if (auditTrailRes.status !== 200 || auditTrailRes.data.count !== 1) {
      throw new Error(`Step F Failed: Audit trail count expected 1, got ${auditTrailRes.data.count}`);
    }
    const log = auditTrailRes.data.data[0];
    if (log.originalQty !== 5 || log.adjustedQty !== 10 || log.adjustedByName !== 'Manager Alice' || log.reason !== 'Catering bonus tea batch') {
      throw new Error(`Step F Failed: Audit log contents invalid: ${JSON.stringify(log)}`);
    }
    console.log('  └─► STEP F PASSED: Audit trail log correctly records change (5 -> 10, by Manager Alice, reason: "Catering bonus tea batch").');

    // Cleanup
    await Restaurant.deleteMany({ _id: testTenantId });
    await Order.deleteMany({ restaurantId: testTenantId });
    await Bill.deleteMany({ restaurantId: testTenantId });
    await Dish.deleteMany({ restaurantId: testTenantId });
    await ReportAdjustment.deleteMany({ tenantId: testTenantId });

    console.log('\n========================================================================');
    console.log('🎉 SALES REPORT AUDIT PERSISTENCE & RELOAD SUITE PASSED 100% CLEAN!');
    console.log('========================================================================\n');

  } catch (err: any) {
    console.error('\n❌ AUDIT PERSISTENCE TEST FAILURE:', err.message);
    process.exit(1);
  }
}

if (require.main === module) {
  runAuditPersistenceSuite().then(() => process.exit(0));
}
