import { Router, Response } from 'express';
import Order from '../models/Order';
import Table from '../models/Table';
import Bill from '../models/Bill';
import Restaurant from '../models/Restaurant';
import { protect, restrictTo, AuthRequest } from '../middleware/auth';

const router = Router();

/**
 * @route   GET /api/analytics/overview
 * @desc    Get dashboard metrics and sales breakdown charts for a restaurant
 * @access  Private (Restaurant Admin only)
 */
router.get('/overview', protect, restrictTo('restaurant_admin'), async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user || !req.user.restaurantId) {
      return res.status(400).json({ success: false, message: 'User is not associated with any restaurant.' });
    }

    const restaurantId = req.user.restaurantId;

    // Time boundaries
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    // Execute all core metrics and aggregation queries in parallel
    const [
      totalOrders,
      todayOrders,
      activeTablesCount,
      totalRevenueAggregation,
      todayRevenueAggregation,
      salesTrend,
      popularDishes,
      orderStatuses,
    ] = await Promise.all([
      Order.countDocuments({ restaurantId, status: 'completed' }),
      Order.countDocuments({ restaurantId, status: 'completed', createdAt: { $gte: startOfToday } }),
      Table.countDocuments({ restaurantId }),
      Order.aggregate([
        { $match: { restaurantId, status: 'completed' } },
        { $group: { _id: null, total: { $sum: '$totalAmount' } } },
      ]),
      Order.aggregate([
        { $match: { restaurantId, status: 'completed', createdAt: { $gte: startOfToday } } },
        { $group: { _id: null, total: { $sum: '$totalAmount' } } },
      ]),
      Order.aggregate([
        {
          $match: {
            restaurantId,
            status: 'completed',
            createdAt: { $gte: thirtyDaysAgo },
          },
        },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
            revenue: { $sum: '$totalAmount' },
            count: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
        {
          $project: {
            date: '$_id',
            revenue: 1,
            count: 1,
            _id: 0,
          },
        },
      ]),
      Order.aggregate([
        { $match: { restaurantId, status: 'completed' } },
        { $unwind: '$items' },
        {
          $group: {
            _id: '$items.name',
            quantity: { $sum: '$items.quantity' },
            revenue: { $sum: { $multiply: ['$items.price', '$items.quantity'] } },
          },
        },
        { $sort: { quantity: -1 } },
        { $limit: 5 },
        {
          $project: {
            name: '$_id',
            quantity: 1,
            revenue: 1,
            _id: 0,
          },
        },
      ]),
      Order.aggregate([
        { $match: { restaurantId } },
        { $group: { _id: '$status', count: { $sum: 1 } } },
        {
          $project: {
            name: '$_id',
            value: '$count',
            _id: 0,
          },
        },
      ]),
    ]);

    const totalRevenue = totalRevenueAggregation[0]?.total || 0;
    const todayRevenue = todayRevenueAggregation[0]?.total || 0;

    return res.json({
      success: true,
      data: {
        cards: {
          totalOrders,
          todayOrders,
          totalRevenue,
          todayRevenue,
          activeTablesCount,
        },
        salesTrend,
        popularDishes,
        orderStatuses,
      },
    });
  } catch (error: any) {
    console.error('Analytics aggregation error:', error);
    return res.status(500).json({ success: false, message: 'Failed to aggregate analytics data.', error: error.message });
  }
});

/**
 * @route   GET /api/analytics/peak-hours
 * @desc    Get order counts grouped by hour of the day (for optimizing staff schedules)
 * @access  Private (Restaurant Admin only)
 */
router.get('/peak-hours', protect, restrictTo('restaurant_admin'), async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user || !req.user.restaurantId) {
      return res.status(400).json({ success: false, message: 'User is not associated with any restaurant.' });
    }

    const peakHours = await Order.aggregate([
      { $match: { restaurantId: req.user.restaurantId, status: 'completed' } },
      {
        $group: {
          _id: { $hour: { date: '$createdAt', timezone: 'Asia/Kolkata' } },
          orders: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
      {
        $project: {
          hour: '$_id',
          orders: 1,
          _id: 0,
        },
      },
    ]);

    // Fill in missing hours to ensure continuous chart (0 to 23)
    const hoursMap = new Map(peakHours.map(ph => [ph.hour, ph.orders]));
    const completeHoursList = Array.from({ length: 24 }, (_, i) => ({
      hour: `${String(i).padStart(2, '0')}:00`,
      orders: hoursMap.get(i) || 0,
    }));

    return res.json({ success: true, data: completeHoursList });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: 'Failed to fetch hourly sales data.', error: error.message });
  }
});

/**
 * @route   GET /api/analytics/daily-report
 * @desc    Generate date-range sales report in CSV format
 * @access  Private (Restaurant Admin only)
 */
router.get('/daily-report', protect, restrictTo('restaurant_admin'), async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user || !req.user.restaurantId) {
      return res.status(400).json({ success: false, message: 'User is not associated with any restaurant.' });
    }
    const restaurantId = req.user.restaurantId;

    // Accept startDate & endDate, or fallback to single date param, or fallback to today
    const dateParam = req.query.date as string;
    const startDateParam = (req.query.startDate as string) || dateParam || new Date().toISOString().split('T')[0];
    const endDateParam = (req.query.endDate as string) || dateParam || startDateParam;

    const startParts = startDateParam.split('-');
    const endParts = endDateParam.split('-');

    const startDate = new Date(Number(startParts[0]), Number(startParts[1]) - 1, Number(startParts[2]), 0, 0, 0, 0);
    const endDate = new Date(Number(endParts[0]), Number(endParts[1]) - 1, Number(endParts[2]), 23, 59, 59, 999);

    const restaurant = await Restaurant.findById(restaurantId);
    const cafeName = restaurant ? restaurant.name : 'Central Cafe & Bistro';

    const rawBills = await Bill.find({
      restaurantId,
      paymentStatus: 'paid',
      updatedAt: { $gte: startDate, $lte: endDate }
    }).populate('orderId').sort({ updatedAt: 1 }).lean();

    const bills = rawBills.filter((b) => b.paymentStatus === 'paid' && b.orderId && (b.orderId as any).status === 'completed');

    // Scenario C: Zero matching bills in range -> Return HTTP 404 JSON error
    if (bills.length === 0) {
      return res.status(404).json({
        success: false,
        message: `No settled transactions found between ${startDateParam} and ${endDateParam}.`
      });
    }

    const totalBills = bills.length;
    const totalRevenue = bills.reduce((sum, b) => sum + b.totalAmount, 0);
    const totalSubtotal = bills.reduce((sum, b) => sum + b.subtotal, 0);
    const totalTax = bills.reduce((sum, b) => sum + b.tax, 0);
    const upiRevenue = bills.filter(b => b.paymentMethod === 'upi_link').reduce((sum, b) => sum + b.totalAmount, 0);
    const cashRevenue = bills.filter(b => b.paymentMethod === 'cash').reduce((sum, b) => sum + b.totalAmount, 0);

    // Compute actual date bounds of found data
    const actualStart = new Date(bills[0].updatedAt);
    const actualEnd = new Date(bills[bills.length - 1].updatedAt);
    const actualStartStr = actualStart.toISOString().split('T')[0];
    const actualEndStr = actualEnd.toISOString().split('T')[0];

    const isSingleDay = startDateParam === endDateParam;
    const requestedRangeStr = isSingleDay ? startDateParam : `${startDateParam} to ${endDateParam}`;
    const actualRangeStr = actualStartStr === actualEndStr ? actualStartStr : `${actualStartStr} to ${actualEndStr}`;
    const isPartialRange = !isSingleDay && (actualStartStr !== startDateParam || actualEndStr !== endDateParam);

    let csv = `SALES REPORT,${cafeName.replace(/,/g, ' ')}\n`;
    csv += `Requested Period,${requestedRangeStr}\n`;
    csv += `Actual Data Period,${actualRangeStr}\n`;
    if (isPartialRange) {
      csv += `Data Status,Partial data available (No transactions prior to ${actualStartStr} or after ${actualEndStr} within range)\n`;
    }
    csv += `\n`;

    csv += `SUMMARY METRICS\n`;
    csv += `Total Bills,Total Subtotal (Rs.),Total Tax (Rs.),UPI Revenue (Rs.),Cash Revenue (Rs.),Total Revenue (Rs.)\n`;
    csv += `${totalBills},${totalSubtotal.toFixed(2)},${totalTax.toFixed(2)},${upiRevenue.toFixed(2)},${cashRevenue.toFixed(2)},${totalRevenue.toFixed(2)}\n\n`;

    // Per-day breakdown for multi-day ranges
    const dayMap = new Map<string, { count: number; subtotal: number; tax: number; upi: number; cash: number; total: number }>();
    bills.forEach(bill => {
      const dStr = new Date(bill.updatedAt).toISOString().split('T')[0];
      const curr = dayMap.get(dStr) || { count: 0, subtotal: 0, tax: 0, upi: 0, cash: 0, total: 0 };
      dayMap.set(dStr, {
        count: curr.count + 1,
        subtotal: curr.subtotal + bill.subtotal,
        tax: curr.tax + bill.tax,
        upi: curr.upi + (bill.paymentMethod === 'upi_link' ? bill.totalAmount : 0),
        cash: curr.cash + (bill.paymentMethod === 'cash' ? bill.totalAmount : 0),
        total: curr.total + bill.totalAmount
      });
    });

    csv += `DAILY BREAKDOWN\n`;
    csv += `Date,Total Bills,Subtotal (Rs.),Tax (Rs.),UPI Revenue (Rs.),Cash Revenue (Rs.),Total Revenue (Rs.)\n`;
    dayMap.forEach((val, key) => {
      csv += `${key},${val.count},${val.subtotal.toFixed(2)},${val.tax.toFixed(2)},${val.upi.toFixed(2)},${val.cash.toFixed(2)},${val.total.toFixed(2)}\n`;
    });
    csv += `\n`;

    const itemMap = new Map<string, { quantity: number; revenue: number }>();
    bills.forEach(bill => {
      const order = bill.orderId as any;
      if (order && order.items) {
        order.items.forEach((item: any) => {
          const current = itemMap.get(item.name) || { quantity: 0, revenue: 0 };
          itemMap.set(item.name, {
            quantity: current.quantity + item.quantity,
            revenue: current.revenue + (item.price * item.quantity)
          });
        });
      }
    });

    csv += `DISH SALES BREAKDOWN\n`;
    csv += `Dish Name,Quantity Sold,Estimated Revenue (Rs.)\n`;
    if (itemMap.size === 0) {
      csv += `No dishes sold in this period,0,0.00\n`;
    } else {
      itemMap.forEach((val, key) => {
        csv += `"${key.replace(/"/g, '""')}",${val.quantity},${val.revenue.toFixed(2)}\n`;
      });
    }
    csv += `\n`;

    csv += `TRANSACTION DETAILS\n`;
    csv += `Bill Number,Table,Customer Name,Subtotal (Rs.),Tax (Rs.),Total Amount (Rs.),Payment Method,Settled Date & Time\n`;

    bills.forEach(bill => {
      const order = bill.orderId as any;
      const custName = order ? order.customerName : 'Walk-in';
      const tableNum = order ? order.tableNumber : 'N/A';
      const dateObj = new Date(bill.updatedAt);
      const dateStr = dateObj.toLocaleDateString('en-US', { year: 'numeric', month: '2-digit', day: '2-digit' });
      const timeStr = dateObj.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
      const methodStr = bill.paymentMethod === 'cash' ? 'Cash' : 'UPI';
      csv += `${bill.billNumber},${tableNum},"${custName.replace(/"/g, '""')}",${bill.subtotal.toFixed(2)},${bill.tax.toFixed(2)},${bill.totalAmount.toFixed(2)},${methodStr},${dateStr} ${timeStr}\n`;
    });

    const filename = isSingleDay
      ? `daily_sales_report_${startDateParam}.csv`
      : `sales_report_${startDateParam}_to_${endDateParam}.csv`;

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=${filename}`);
    return res.status(200).send(csv);
  } catch (error: any) {
    console.error('Date-range sales report error:', error);
    return res.status(500).json({ success: false, message: 'Failed to generate sales report.', error: error.message });
  }
});

/**
 * @route   GET /api/analytics/daily-sales
 * @desc    Get structured daily sales report data (Summary, Itemized particulars, and Payments) for a specific business date
 * @access  Private (Restaurant Admin / Staff)
 */
router.get('/daily-sales', protect, restrictTo('restaurant_admin', 'staff'), async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user || !req.user.restaurantId) {
      return res.status(400).json({ success: false, message: 'User is not associated with any restaurant.' });
    }
    const restaurantId = req.user.restaurantId;

    // Date parsing: Defaults to today in local date
    const now = new Date();
    const targetDateStr = (req.query.date as string) || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const [yearStr, monthStr, dayStr] = targetDateStr.split('-');
    const year = parseInt(yearStr, 10);
    const month = parseInt(monthStr, 10) - 1;
    const day = parseInt(dayStr, 10);

    const startOfDay = new Date(year, month, day, 0, 0, 0, 0);
    const endOfDay = new Date(year, month, day, 23, 59, 59, 999);

    const restaurant = await Restaurant.findById(restaurantId).lean();
    const cafeName = restaurant ? restaurant.name : 'CafeFlow Restaurant';

    // 1. Fetch settled bills on the selected business date
    const rawBills = await Bill.find({
      restaurantId,
      paymentStatus: 'paid',
      updatedAt: { $gte: startOfDay, $lte: endOfDay }
    }).populate('orderId').sort({ updatedAt: 1 }).lean();

    const bills = rawBills.filter((b) => b.paymentStatus === 'paid' && b.orderId && (b.orderId as any).status === 'completed');

    // 2. Query order counts for the full business day
    const [allOrdersCount, completedOrdersCount, cancelledOrdersCount] = await Promise.all([
      Order.countDocuments({ restaurantId, createdAt: { $gte: startOfDay, $lte: endOfDay } }),
      Order.countDocuments({ restaurantId, status: 'completed', createdAt: { $gte: startOfDay, $lte: endOfDay } }),
      Order.countDocuments({ restaurantId, status: 'cancelled', createdAt: { $gte: startOfDay, $lte: endOfDay } }),
    ]);

    // 3. Aggregate item-wise particulars
    const itemMap = new Map<string, { name: string; quantity: number; amount: number }>();
    let totalItemsCount = 0;

    bills.forEach((bill: any) => {
      const order = bill.orderId;
      if (order && Array.isArray(order.items)) {
        order.items.forEach((item: any) => {
          totalItemsCount += (item.quantity || 1);
          const extraPrice = Array.isArray(item.customizations)
            ? item.customizations.reduce((sum: number, c: any) => sum + (c.extraPrice || 0), 0)
            : 0;
          const unitPrice = (item.price || 0) + extraPrice;
          const itemTotal = unitPrice * (item.quantity || 1);

          const existing = itemMap.get(item.name) || { name: item.name, quantity: 0, amount: 0 };
          itemMap.set(item.name, {
            name: item.name,
            quantity: existing.quantity + (item.quantity || 1),
            amount: Number((existing.amount + itemTotal).toFixed(2))
          });
        });
      }
    });

    const items = Array.from(itemMap.values()).sort((a, b) => b.quantity - a.quantity || a.name.localeCompare(b.name));

    // 4. Payment breakdown
    let cashAmount = 0;
    let cashCount = 0;
    let upiAmount = 0;
    let upiCount = 0;
    let otherAmount = 0;
    let otherCount = 0;

    bills.forEach((bill: any) => {
      if (bill.paymentMethod === 'cash') {
        cashAmount += bill.totalAmount;
        cashCount += 1;
      } else if (bill.paymentMethod === 'upi_link' || bill.paymentMethod === 'upi') {
        upiAmount += bill.totalAmount;
        upiCount += 1;
      } else {
        otherAmount += bill.totalAmount;
        otherCount += 1;
      }
    });

    const payments = [
      { method: 'cash', label: 'Cash', count: cashCount, amount: Number(cashAmount.toFixed(2)) },
      { method: 'upi_link', label: 'Online / UPI', count: upiCount, amount: Number(upiAmount.toFixed(2)) },
    ];
    if (otherCount > 0) {
      payments.push({ method: 'other', label: 'Other', count: otherCount, amount: Number(otherAmount.toFixed(2)) });
    }

    // 5. Summary metrics
    const totalOrders = bills.length;
    const grossSales = Number(bills.reduce((sum: number, b: any) => sum + (b.subtotal || 0), 0).toFixed(2));
    const taxes = Number(bills.reduce((sum: number, b: any) => sum + (b.tax || 0), 0).toFixed(2));
    const netSales = Number(bills.reduce((sum: number, b: any) => sum + (b.totalAmount || 0), 0).toFixed(2));
    const averageOrderValue = totalOrders > 0 ? Number((netSales / totalOrders).toFixed(2)) : 0;

    const dateObj = new Date(year, month, day);
    const formattedDate = dateObj.toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });

    const generatedAt = new Date().toLocaleString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });

    return res.json({
      success: true,
      data: {
        date: targetDateStr,
        formattedDate,
        generatedAt,
        restaurant: {
          name: cafeName,
          address: restaurant?.address || '',
          contact: restaurant?.contact || '',
          gstNumber: restaurant?.gstNumber || '',
          taxRate: restaurant?.taxRate !== undefined && restaurant?.taxRate !== null ? Number(restaurant.taxRate) : 5,
        },
        summary: {
          grossSales,
          taxes,
          taxRate: restaurant?.taxRate !== undefined && restaurant?.taxRate !== null ? Number(restaurant.taxRate) : 5,
          netSales,
          totalOrders,
          completedOrders: completedOrdersCount,
          cancelledOrders: cancelledOrdersCount,
          allOrders: allOrdersCount,
          totalItems: totalItemsCount,
          averageOrderValue,
        },
        items,
        payments,
      },
    });
  } catch (error: any) {
    console.error('Daily sales report aggregation error:', error);
    return res.status(500).json({ success: false, message: 'Failed to aggregate daily sales report.', error: error.message });
  }
});

export default router;
