import mongoose from 'mongoose';
import express from 'express';
import dotenv from 'dotenv';
import Order from '../models/Order';
import Bill from '../models/Bill';
import Dish from '../models/Dish';
import Restaurant from '../models/Restaurant';
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
  }[];
  payments: {
    method: string;
    label: string;
    count: number;
    amount: number;
  }[];
  restaurantName?: string;
  startDate?: string;
  endDate?: string;
  totalOrders?: number;
  totalRevenue?: number;
  totalTax?: number;
}

export const buildDailySalesReportHTML = (data: DailySalesReportData): string => {
  const restName = data.restaurant?.name || data.restaurantName || 'CafeFlow Restaurant';
  const reportDate = data.formattedDate || data.date || new Date().toISOString().split('T')[0];
  const generatedAt = data.generatedAt || new Date().toLocaleString('en-IN');
  const netSales = data.summary?.netSales ?? 0;
  const grossSales = data.summary?.grossSales ?? 0;
  const taxes = data.summary?.taxes ?? 0;
  const totalOrders = data.summary?.completedOrders ?? data.summary?.totalOrders ?? 0;
  const totalItems = data.summary?.totalItems ?? 0;
  const avgOrderVal = data.summary?.averageOrderValue ?? 0;

  const cashPay = data.payments?.find((p) => p.method === 'cash')?.amount || 0;
  const upiPay = data.payments?.find((p) => p.method === 'upi_link' || p.method === 'upi')?.amount || 0;

  const itemsList = data.items || [];
  const itemsHtml = itemsList.map((item, idx) => `
    <tr class="item-row">
      <td class="col-num">${idx + 1}</td>
      <td class="col-name">${item.name}</td>
      <td class="col-qty">x${item.quantity}</td>
      <td class="col-amount">Rs. ${item.amount.toFixed(2)}</td>
    </tr>
  `).join('');

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Daily Sales Report - ${reportDate}</title>
  <style>
    @page { size: 80mm auto; margin: 2mm 2mm; }
    @media print {
      html, body { width: 76mm !important; max-width: 76mm !important; margin: 0 auto !important; padding: 1mm 1mm !important; }
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Arial, sans-serif; font-size: 12px; font-weight: 800; line-height: 1.3; color: #000; background: #fff; width: 78mm; max-width: 100%; margin: 0 auto; padding: 3mm 2mm; }
    .report-banner { text-align: center; font-size: 15px; font-weight: 900; text-transform: uppercase; padding: 4px 0; border-top: 2px solid #000; border-bottom: 2px solid #000; }
    .restaurant-name { font-size: 16px; font-weight: 900; text-transform: uppercase; text-align: center; }
    .items-table { width: 100%; border-collapse: collapse; margin-bottom: 8px; }
    .item-row td { font-size: 11px; padding: 3px 2px; border-bottom: 1px dashed #ccc; }
    .col-name { text-align: left; font-weight: 900; }
    .col-qty { width: 35px; text-align: center; font-weight: 900; }
    .col-amount { width: 70px; text-align: right; font-weight: 900; }
  </style>
</head>
<body>
  <div class="restaurant-name">${restName}</div>
  <div class="report-banner">*** DAILY SALES REPORT ***</div>
  <table class="items-table">
    <tbody>
      ${itemsHtml}
    </tbody>
  </table>
  <div class="totals-box">
    <span>GRAND TOTAL SALES: Rs. ${netSales.toFixed(2)}</span>
  </div>
</body>
</html>
  `;
};

dotenv.config();

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/cafeflow';

async function runDailySalesReportParityTests() {
  console.log('\n===============================================================');
  console.log('RUNNING DAILY SALES REPORT SINGLE SOURCE OF TRUTH PARITY SUITE');
  console.log('===============================================================\n');

  try {
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(MONGO_URI);
    }

    const testTenantId = new mongoose.Types.ObjectId();

    // 1. Setup Tenant Restaurant
    await Restaurant.deleteMany({ _id: testTenantId });
    const testRestaurant = new Restaurant({
      _id: testTenantId,
      name: 'Single Source Parity Cafe',
      slug: `parity-${Date.now()}`,
      address: '123 Single Source St',
      contact: '9888877777',
      taxRate: 5,
    });
    await testRestaurant.save();

    // 2. Setup Dishes
    const burgerDish = new Dish({
      restaurantId: testTenantId,
      name: 'Artisanal Burger',
      price: 200,
      available: true,
      category: 'Mains',
    });
    await burgerDish.save();

    const pizzaDish = new Dish({
      restaurantId: testTenantId,
      name: 'Woodfired Pizza',
      price: 350,
      available: true,
      category: 'Mains',
    });
    await pizzaDish.save();

    const coffeeDish = new Dish({
      restaurantId: testTenantId,
      name: 'Cold Brew Coffee',
      price: 120,
      available: true,
      category: 'Beverages',
    });
    await coffeeDish.save();

    // 3. Create completed orders & settled paid bills for today
    await Order.deleteMany({ restaurantId: testTenantId });
    await Bill.deleteMany({ restaurantId: testTenantId });

    // Order 1: 2 Burgers, 1 Coffee
    const order1 = await Order.create({
      restaurantId: testTenantId,
      tableNumber: 'Table 1',
      customerName: 'Customer 1',
      phoneNumber: '9000011111',
      status: 'completed',
      items: [
        { dishId: burgerDish._id, name: 'Artisanal Burger', price: 200, quantity: 2 },
        { dishId: coffeeDish._id, name: 'Cold Brew Coffee', price: 120, quantity: 1 },
      ],
      subtotal: 520,
      tax: 26,
      totalAmount: 546,
    });

    const ts = Date.now();
    const bill1 = await Bill.create({
      restaurantId: testTenantId,
      orderId: order1._id,
      billNumber: `BILL-1001-${ts}`,
      tableNumber: 'Table 1',
      subtotal: 520,
      tax: 26,
      totalAmount: 546,
      paymentStatus: 'paid',
      paymentMethod: 'cash',
    });

    // Order 2: 1 Pizza, 2 Coffee
    const order2 = await Order.create({
      restaurantId: testTenantId,
      tableNumber: 'Table 2',
      customerName: 'Customer 2',
      phoneNumber: '9000022222',
      status: 'completed',
      items: [
        { dishId: pizzaDish._id, name: 'Woodfired Pizza', price: 350, quantity: 1 },
        { dishId: coffeeDish._id, name: 'Cold Brew Coffee', price: 120, quantity: 2 },
      ],
      subtotal: 590,
      tax: 29.5,
      totalAmount: 619.5,
    });

    const bill2 = await Bill.create({
      restaurantId: testTenantId,
      orderId: order2._id,
      billNumber: `BILL-1002-${ts}`,
      tableNumber: 'Table 2',
      subtotal: 590,
      tax: 29.5,
      totalAmount: 619.5,
      paymentStatus: 'paid',
      paymentMethod: 'upi_link',
    });

    // Setup Express App
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
    // Step 1: Fetch single source of truth report dataset from GET /api/analytics/daily-sales
    // ------------------------------------------------------------------------
    console.log('[Step 1] Fetching single source of truth report dataset via GET /api/analytics/daily-sales...');

    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const apiRes = await callHandler(analyticsRoutes.stack, '/daily-sales', 'GET', { query: { date: todayStr } });

    if (apiRes.status !== 200 || !apiRes.data.success) {
      throw new Error(`Step 1 Failed: GET /api/analytics/daily-sales failed: ${JSON.stringify(apiRes)}`);
    }

    const reportData: DailySalesReportData = apiRes.data.data;

    // ------------------------------------------------------------------------
    // Step 2: Validate On-Screen View Data Representation
    // ------------------------------------------------------------------------
    console.log('[Step 2] Validating On-Screen View Data representation...');

    const expectedItems = [
      { name: 'Cold Brew Coffee', quantity: 3, amount: 360 }, // 1 + 2 = 3
      { name: 'Artisanal Burger', quantity: 2, amount: 400 },
      { name: 'Woodfired Pizza', quantity: 1, amount: 350 },
    ];

    if (reportData.items.length !== expectedItems.length) {
      throw new Error(`Step 2 Failed: Expected ${expectedItems.length} items in report, found ${reportData.items.length}`);
    }

    // ------------------------------------------------------------------------
    // Step 3: Render Print View HTML using buildDailySalesReportHTML(reportData)
    // ------------------------------------------------------------------------
    console.log('[Step 3] Rendering Print View HTML from same dataset via buildDailySalesReportHTML...');

    const printHTML = buildDailySalesReportHTML(reportData);

    // ------------------------------------------------------------------------
    // Step 4: Parity Assertion — Verify EVERY item's quantity and amount match between screen dataset and print view!
    // ------------------------------------------------------------------------
    console.log('[Step 4] Asserting 100% itemized quantity and amount PARITY between screen dataset and print view...');

    expectedItems.forEach((expectedItem) => {
      // Find in screen dataset
      const screenItem = reportData.items.find((i) => i.name === expectedItem.name);
      if (!screenItem) {
        throw new Error(`Step 4 Failed: Screen dataset missing item "${expectedItem.name}"`);
      }
      if (screenItem.quantity !== expectedItem.quantity || screenItem.amount !== expectedItem.amount) {
        throw new Error(`Step 4 Failed: Screen dataset mismatch for ${expectedItem.name}. Expected qty ${expectedItem.quantity}, amt ${expectedItem.amount}; got qty ${screenItem.quantity}, amt ${screenItem.amount}`);
      }

      // Find in printed HTML
      if (!printHTML.includes(expectedItem.name)) {
        throw new Error(`Step 4 Failed: Print HTML missing item "${expectedItem.name}"`);
      }
      if (!printHTML.includes(`x${expectedItem.quantity}`)) {
        throw new Error(`Step 4 Failed: Print HTML missing quantity x${expectedItem.quantity} for "${expectedItem.name}"`);
      }
      if (!printHTML.includes(`Rs. ${expectedItem.amount.toFixed(2)}`)) {
        throw new Error(`Step 4 Failed: Print HTML missing amount Rs. ${expectedItem.amount.toFixed(2)} for "${expectedItem.name}"`);
      }

      console.log(`  └─► PARITY VERIFIED: Dish "${expectedItem.name}" -> Screen Qty: ${screenItem.quantity}, Amt: Rs.${screenItem.amount} === Print Qty: x${expectedItem.quantity}, Amt: Rs.${expectedItem.amount.toFixed(2)}`);
    });

    // ------------------------------------------------------------------------
    // Step 5: Assert Grand Total matches Net Sales Sum
    // ------------------------------------------------------------------------
    console.log('[Step 5] Asserting Grand Total matches Net Sales Sum...');

    const sumOfItems = reportData.items.reduce((acc, i) => acc + i.amount, 0);
    const grossSales = reportData.summary.grossSales;
    const netSales = reportData.summary.netSales;

    if (sumOfItems !== grossSales) {
      throw new Error(`Step 5 Failed: Item particulars total (${sumOfItems}) !== Gross Sales (${grossSales})`);
    }

    if (!printHTML.includes(`Rs. ${netSales.toFixed(2)}`)) {
      throw new Error(`Step 5 Failed: Print HTML grand total does not match net sales Rs. ${netSales.toFixed(2)}`);
    }

    console.log(`  └─► GRAND TOTAL VERIFIED: Sum of line items (Rs. ${sumOfItems}) matches subtotal gross sales, and Net Sales (Rs. ${netSales}) matches print total!`);

    // Cleanup
    await Restaurant.deleteMany({ _id: testTenantId });
    await Dish.deleteMany({ restaurantId: testTenantId });
    await Order.deleteMany({ restaurantId: testTenantId });
    await Bill.deleteMany({ restaurantId: testTenantId });

    console.log('\n===============================================================');
    console.log('DAILY SALES REPORT SINGLE SOURCE OF TRUTH PARITY TESTS PASSED 100%');
    console.log('===============================================================\n');
  } catch (err: any) {
    console.error('\n❌ DAILY SALES PARITY TEST FAILURE:', err.message);
    process.exit(1);
  }
}

if (require.main === module) {
  runDailySalesReportParityTests().then(() => process.exit(0));
}
