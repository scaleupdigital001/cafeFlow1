import mongoose from 'mongoose';
import express from 'express';
import dotenv from 'dotenv';
import Order from '../models/Order';
import Bill from '../models/Bill';
import Dish from '../models/Dish';
import Restaurant from '../models/Restaurant';
import ReportAdjustment from '../models/ReportAdjustment';
import analyticsRoutes from '../routes/analytics';
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
    * { box-sizing: border-box; font-weight: 900 !important; }
    .col-particulars { flex: 1; }
    .col-qty { width: 42px; text-align: center; }
    .col-amt { width: 80px; text-align: right; }
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

dotenv.config();

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/cafeflow';

async function runSalesReportAuditSuite() {
  console.log('\n===============================================================');
  console.log('RUNNING SALES REPORT AUDIT ADJUSTMENTS SUITE');
  console.log('===============================================================\n');

  try {
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(MONGO_URI);
    }

    const testTenantId = new mongoose.Types.ObjectId();
    const ts = Date.now();

    // 1. Setup Tenant & Menu Items
    await Restaurant.deleteMany({ _id: testTenantId });
    await ReportAdjustment.deleteMany({ tenantId: testTenantId });

    const restaurant = new Restaurant({
      _id: testTenantId,
      name: 'Audit Trail Cafe',
      slug: `audit-${ts}`,
      address: '100 Audit Way',
      contact: '9999900000',
      taxRate: 5,
    });
    await restaurant.save();

    const teaDish = new Dish({
      restaurantId: testTenantId,
      name: 'Cutting Tea',
      price: 20,
      available: true,
      category: 'Beverages',
    });
    await teaDish.save();

    const samosaDish = new Dish({
      restaurantId: testTenantId,
      name: 'Hot Samosa',
      price: 30,
      available: true,
      category: 'Snacks',
    });
    await samosaDish.save();

    // 2. Setup Orders & Settled Bills for Today
    await Order.deleteMany({ restaurantId: testTenantId });
    await Bill.deleteMany({ restaurantId: testTenantId });

    // Order 1: 5 Cutting Tea (5 x 20 = 100), 2 Hot Samosa (2 x 30 = 60) -> Subtotal 160
    const order1 = await Order.create({
      restaurantId: testTenantId,
      tableNumber: 'T1',
      customerName: 'Audit Tester',
      phoneNumber: '9111122222',
      status: 'completed',
      items: [
        { dishId: teaDish._id, name: 'Cutting Tea', price: 20, quantity: 5 },
        { dishId: samosaDish._id, name: 'Hot Samosa', price: 30, quantity: 2 },
      ],
      subtotal: 160,
      tax: 8,
      totalAmount: 168,
    });

    await Bill.create({
      restaurantId: testTenantId,
      orderId: order1._id,
      billNumber: `BILL-AUDIT-1-${ts}`,
      tableNumber: 'T1',
      subtotal: 160,
      tax: 8,
      totalAmount: 168,
      paymentStatus: 'paid',
      paymentMethod: 'cash',
    });

    // Setup Express Mock App
    const app = express();
    app.use(express.json());
    app.use((req: any, res: any, next: any) => {
      req.user = {
        _id: new mongoose.Types.ObjectId().toString(),
        restaurantId: testTenantId.toString(),
        name: 'Manager Bob',
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
        name: 'Manager Bob',
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
    // Step A: Fetch Raw Initial Daily Sales Report
    // ------------------------------------------------------------------------
    console.log('[Step A] Fetching initial raw daily sales report...');
    const rawReportRes = await callHandler(analyticsRoutes.stack, '/daily-sales', 'GET', { query: { date: todayStr } });
    const rawReport: DailySalesReportData = rawReportRes.data.data;

    const rawTeaItem = rawReport.items.find((i) => i.name === 'Cutting Tea');
    if (!rawTeaItem || rawTeaItem.quantity !== 5 || rawTeaItem.amount !== 100) {
      throw new Error(`Step A Failed: Expected raw Cutting Tea qty 5, amt 100. Found ${JSON.stringify(rawTeaItem)}`);
    }
    if (rawReport.summary.grossSales !== 160) {
      throw new Error(`Step A Failed: Expected raw gross sales 160. Found ${rawReport.summary.grossSales}`);
    }
    console.log('  └─► Raw Cutting Tea Qty: 5, Amount: Rs. 100, Gross Sales: Rs. 160');

    // ------------------------------------------------------------------------
    // Step B: Edit "Cutting Tea" Qty from 5 to 8 via POST /api/analytics/daily-sales/adjust
    // ------------------------------------------------------------------------
    console.log('[Step B] Executing audit adjustment: Editing "Cutting Tea" quantity from 5 to 8...');
    const adjustRes = await callHandler(analyticsRoutes.stack, '/daily-sales/adjust', 'POST', {
      body: {
        date: todayStr,
        itemName: 'Cutting Tea',
        adjustedQty: 8,
        reason: 'Staff complimentary tea addition',
      },
    });

    if (adjustRes.status !== 200 || !adjustRes.data.success) {
      throw new Error(`Step B Failed: Adjustment endpoint returned error: ${JSON.stringify(adjustRes.data)}`);
    }
    console.log('  └─► Adjustment saved to database successfully!');

    // ------------------------------------------------------------------------
    // Step C: Verify Recalculation on Report Fetch (View & Print Data)
    // ------------------------------------------------------------------------
    console.log('[Step C] Refetching daily sales report to verify item amount & grand total recalculation...');
    const adjReportRes = await callHandler(analyticsRoutes.stack, '/daily-sales', 'GET', { query: { date: todayStr } });
    const adjReport: DailySalesReportData = adjReportRes.data.data;

    const adjTeaItem = adjReport.items.find((i) => i.name === 'Cutting Tea');
    if (!adjTeaItem) throw new Error('Step C Failed: Cutting Tea item missing from report.');

    // (a) Item amount recalculated: 8 x Rs.20 = Rs.160
    if (adjTeaItem.quantity !== 8 || adjTeaItem.amount !== 160) {
      throw new Error(`Step C (a) Failed: Expected adjusted Cutting Tea qty 8, amt 160. Found qty ${adjTeaItem.quantity}, amt ${adjTeaItem.amount}`);
    }
    if (!adjTeaItem.isAdjusted) {
      throw new Error('Step C (a) Failed: isAdjusted flag is false on adjusted item.');
    }
    console.log(`  └─► Item Recalculated: Cutting Tea -> Qty: 8, Amount: Rs. 160 (isAdjusted: ${adjTeaItem.isAdjusted})`);

    // (b) Grand total recalculated: (8 x 20) + (2 x 30) = 160 + 60 = 220 Gross Sales
    if (adjReport.summary.grossSales !== 220) {
      throw new Error(`Step C (b) Failed: Expected recalculated gross sales 220. Found ${adjReport.summary.grossSales}`);
    }
    console.log(`  └─► Grand Total Recalculated: Gross Sales updated from Rs. 160 to Rs. 220!`);

    // ------------------------------------------------------------------------
    // Step D: Verify Adjustment Record Created with Attribution
    // ------------------------------------------------------------------------
    console.log('[Step D] Verifying ReportAdjustment record attribution in DB...');
    const adjDbRecord = await ReportAdjustment.findOne({ tenantId: testTenantId, reportDate: todayStr, itemName: 'Cutting Tea' });
    if (!adjDbRecord) {
      throw new Error('Step D Failed: ReportAdjustment document not found in DB.');
    }
    if (adjDbRecord.originalQty !== 5 || adjDbRecord.adjustedQty !== 8 || adjDbRecord.adjustedByName !== 'Manager Bob') {
      throw new Error(`Step D Failed: Adjustment document fields mismatch: ${JSON.stringify(adjDbRecord)}`);
    }
    console.log(`  └─► DB Record Verified: Original: 5, Adjusted: 8, AdjustedBy: ${adjDbRecord.adjustedByName}, Reason: "${adjDbRecord.reason}"`);

    // ------------------------------------------------------------------------
    // Step E: Verify Original Raw Order Data is UNTOUCHED
    // ------------------------------------------------------------------------
    console.log('[Step E] Asserting original raw Order and Bill records remain completely UNTOUCHED...');
    const dbOrder = await Order.findById(order1._id);
    if (!dbOrder) throw new Error('Step E Failed: Order missing from DB.');

    const dbTeaItem = dbOrder.items.find((i) => i.name === 'Cutting Tea');
    if (!dbTeaItem || dbTeaItem.quantity !== 5) {
      throw new Error(`Step E Failed: Raw order item quantity was mutated! Expected 5, found ${dbTeaItem?.quantity}`);
    }
    if (dbOrder.subtotal !== 160 || dbOrder.totalAmount !== 168) {
      throw new Error(`Step E Failed: Raw order subtotal/total was mutated! ${dbOrder.subtotal}`);
    }
    console.log('  └─► Raw Order Intact: Cutting Tea qty remains 5, Order subtotal remains Rs. 160!');

    // ------------------------------------------------------------------------
    // Step F: Verify Printed HTML Output Reflects Adjusted Numbers
    // ------------------------------------------------------------------------
    console.log('[Step F] Asserting print HTML output reflects adjusted numbers (8, Rs. 160.00)...');
    const printHtml = buildDailySalesReportHTML(adjReport);

    if (!printHtml.includes('Cutting Tea')) {
      throw new Error('Step F Failed: Print HTML missing item "Cutting Tea".');
    }
    if (!printHtml.includes('<span class="col-qty">8</span>')) {
      throw new Error('Step F Failed: Print HTML does NOT show adjusted quantity 8!');
    }
    if (!printHtml.includes('Rs. 160.00')) {
      throw new Error('Step F Failed: Print HTML does NOT show adjusted line amount Rs. 160.00!');
    }
    if (!printHtml.includes('[ADJUSTED]')) {
      throw new Error('Step F Failed: Print HTML missing [ADJUSTED] badge!');
    }
    console.log('  └─► Print Output Verified: Shows Cutting Tea Qty: 8, Amount: Rs. 160.00, Badge: [ADJUSTED]');

    // ------------------------------------------------------------------------
    // Step G: Verify Audit Trail Endpoint
    // ------------------------------------------------------------------------
    console.log('[Step G] Querying GET /api/analytics/daily-sales/audit-trail...');
    const trailRes = await callHandler(analyticsRoutes.stack, '/daily-sales/audit-trail', 'GET', { query: { date: todayStr } });
    if (trailRes.status !== 200 || !trailRes.data.success || trailRes.data.count !== 1) {
      throw new Error(`Step G Failed: Audit trail response invalid: ${JSON.stringify(trailRes.data)}`);
    }
    console.log(`  └─► Audit Trail Log Verified: ${trailRes.data.count} log entry found for ${todayStr}`);

    // Cleanup
    await Restaurant.deleteMany({ _id: testTenantId });
    await Dish.deleteMany({ restaurantId: testTenantId });
    await Order.deleteMany({ restaurantId: testTenantId });
    await Bill.deleteMany({ restaurantId: testTenantId });
    await ReportAdjustment.deleteMany({ tenantId: testTenantId });

    console.log('\n===============================================================');
    console.log('ALL SALES REPORT AUDIT ADJUSTMENT TESTS PASSED 100%');
    console.log('===============================================================\n');
  } catch (err: any) {
    console.error('\n❌ SALES REPORT AUDIT TEST FAILURE:', err.message);
    process.exit(1);
  }
}

if (require.main === module) {
  runSalesReportAuditSuite().then(() => process.exit(0));
}
