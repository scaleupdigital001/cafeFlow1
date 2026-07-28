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

    // 1. Core counters
    const totalOrders = await Order.countDocuments({ restaurantId });
    const todayOrders = await Order.countDocuments({ restaurantId, createdAt: { $gte: startOfToday } });
    const activeTablesCount = await Table.countDocuments({ restaurantId });

    // 2. Revenue (Completed orders)
    const totalRevenueAggregation = await Order.aggregate([
      { $match: { restaurantId, status: 'completed' } },
      { $group: { _id: null, total: { $sum: '$totalAmount' } } },
    ]);
    const totalRevenue = totalRevenueAggregation[0]?.total || 0;

    const todayRevenueAggregation = await Order.aggregate([
      { $match: { restaurantId, status: 'completed', createdAt: { $gte: startOfToday } } },
      { $group: { _id: null, total: { $sum: '$totalAmount' } } },
    ]);
    const todayRevenue = todayRevenueAggregation[0]?.total || 0;

    // 3. Sales trends (Last 30 Days)
    const salesTrend = await Order.aggregate([
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
    ]);

    // 4. Popular Dishes (Aggregating order items)
    const popularDishes = await Order.aggregate([
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
    ]);

    // 5. Orders by status (Pie chart data)
    const orderStatuses = await Order.aggregate([
      { $match: { restaurantId } },
      { $group: { _id: '$status', count: { $sum: 1 } } },
      {
        $project: {
          name: '$_id',
          value: '$count',
          _id: 0,
        },
      },
    ]);

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
      { $match: { restaurantId: req.user.restaurantId } },
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
 * @desc    Generate daily sales report in CSV format
 * @access  Private (Restaurant Admin only)
 */
router.get('/daily-report', protect, restrictTo('restaurant_admin'), async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user || !req.user.restaurantId) {
      return res.status(400).json({ success: false, message: 'User is not associated with any restaurant.' });
    }
    const restaurantId = req.user.restaurantId;

    const dateParam = req.query.date as string; // YYYY-MM-DD
    let startDate: Date;
    let endDate: Date;

    if (dateParam) {
      const parts = dateParam.split('-');
      startDate = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]), 0, 0, 0);
      endDate = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]), 23, 59, 59, 999);
    } else {
      const now = new Date();
      startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
      endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
    }

    const restaurant = await Restaurant.findById(restaurantId);
    const cafeName = restaurant ? restaurant.name : 'Central Cafe & Bistro';

    const bills = await Bill.find({
      restaurantId,
      paymentStatus: 'paid',
      updatedAt: { $gte: startDate, $lte: endDate }
    }).populate('orderId');

    const totalBills = bills.length;
    const totalRevenue = bills.reduce((sum, b) => sum + b.totalAmount, 0);
    const totalSubtotal = bills.reduce((sum, b) => sum + b.subtotal, 0);
    const totalTax = bills.reduce((sum, b) => sum + b.tax, 0);
    const upiRevenue = bills.filter(b => b.paymentMethod === 'upi_link').reduce((sum, b) => sum + b.totalAmount, 0);
    const cashRevenue = bills.filter(b => b.paymentMethod === 'cash').reduce((sum, b) => sum + b.totalAmount, 0);

    const reportDateStr = startDate.toLocaleDateString('en-US', { year: 'numeric', month: '2-digit', day: '2-digit' });

    let csv = `DAILY SALES REPORT,${cafeName.replace(/,/g, ' ')}\n`;
    csv += `Report Date,${reportDateStr}\n\n`;

    csv += `SUMMARY METRICS\n`;
    csv += `Total Bills,Total Subtotal (Rs.),Total Tax (Rs.),UPI Revenue (Rs.),Cash Revenue (Rs.),Total Revenue (Rs.)\n`;
    csv += `${totalBills},${totalSubtotal.toFixed(2)},${totalTax.toFixed(2)},${upiRevenue.toFixed(2)},${cashRevenue.toFixed(2)},${totalRevenue.toFixed(2)}\n\n`;

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
      csv += `No dishes sold on this date,0,0.00\n`;
    } else {
      itemMap.forEach((val, key) => {
        csv += `"${key.replace(/"/g, '""')}",${val.quantity},${val.revenue.toFixed(2)}\n`;
      });
    }
    csv += `\n`;

    csv += `TRANSACTION DETAILS\n`;
    csv += `Bill Number,Table,Customer Name,Subtotal (Rs.),Tax (Rs.),Total Amount (Rs.),Payment Method,Settled Time\n`;
    
    if (bills.length === 0) {
      csv += `No transactions settled on this date,-,-,0.00,0.00,0.00,-,-\n`;
    } else {
      bills.forEach(bill => {
        const order = bill.orderId as any;
        const custName = order ? order.customerName : 'Walk-in';
        const tableNum = order ? order.tableNumber : 'N/A';
        const timeStr = new Date(bill.updatedAt).toLocaleTimeString('en-US', {
          hour: '2-digit',
          minute: '2-digit',
          hour12: true
        });
        const methodStr = bill.paymentMethod === 'cash' ? 'Cash' : 'UPI';
        csv += `${bill.billNumber},${tableNum},"${custName.replace(/"/g, '""')}",${bill.subtotal.toFixed(2)},${bill.tax.toFixed(2)},${bill.totalAmount.toFixed(2)},${methodStr},${timeStr}\n`;
      });
    }

    const filenameDate = dateParam || new Date().toISOString().split('T')[0];
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=daily_sales_report_${filenameDate}.csv`);
    return res.status(200).send(csv);
  } catch (error: any) {
    console.error('Daily report generation error:', error);
    return res.status(500).json({ success: false, message: 'Failed to generate daily sales report.', error: error.message });
  }
});

export default router;
