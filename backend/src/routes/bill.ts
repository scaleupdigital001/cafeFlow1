import { Router, Response } from 'express';
import path from 'path';
import fs from 'fs';
import Bill from '../models/Bill';
import Order from '../models/Order';
import Restaurant from '../models/Restaurant';
import TableSession from '../models/TableSession';
import WaiterRequest from '../models/WaiterRequest';
import { canonicalTableKey } from '../utils/tableUtils';
import { protect, restrictTo, AuthRequest } from '../middleware/auth';

const router = Router();

/**
 * @route   GET /api/bills/order/:orderId
 * @desc    Get bill details by order ID (Public - used by tracking screen)
 * @access  Public
 */
router.get('/order/:orderId', async (req, res) => {
  try {
    const bill = await Bill.findOne({ orderId: req.params.orderId })
      .populate('orderId')
      .populate('restaurantId', 'name address contact gstNumber paymentSettings')
      .lean();
    
    if (!bill) {
      return res.status(404).json({ success: false, message: 'Bill has not been generated for this order yet.' });
    }

    return res.json({ success: true, data: bill });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: 'Failed to fetch bill details.', error: error.message });
  }
});

/**
 * @route   GET /api/bills/my-restaurant
 * @desc    Get all bills generated for this restaurant tenant
 * @access  Private (Restaurant Admin / Staff)
 */
const getRestaurantBillsHandler = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user || !req.user.restaurantId) {
      return res.status(400).json({ success: false, message: 'User is not associated with any restaurant.' });
    }

    const { includeVoid } = req.query;
    const queryFilter: any = { restaurantId: req.user.restaurantId };
    if (includeVoid !== 'true') {
      queryFilter.paymentStatus = { $ne: 'void' };
    }

    const bills = await Bill.find(queryFilter)
      .populate('orderId', 'customerName phoneNumber tableNumber mergeNote')
      .sort({ createdAt: -1 })
      .lean();

    return res.json({ success: true, count: bills.length, data: bills });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: 'Failed to fetch restaurant bills.', error: error.message });
  }
};

router.get('/my-restaurant', protect, restrictTo('restaurant_admin', 'staff'), getRestaurantBillsHandler);
router.get('/recent', protect, restrictTo('restaurant_admin', 'staff'), getRestaurantBillsHandler);

/**
 * @route   GET /api/bills/download/:filename
 * @desc    Download or view the invoice PDF
 * @access  Public
 */
router.get('/download/:filename', async (req, res) => {
  try {
    const { filename } = req.params;
    
    // Safety check against path traversal
    if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
      return res.status(400).json({ success: false, message: 'Invalid file parameter.' });
    }

    const filePath = path.join(__dirname, '../../public/bills', filename);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ success: false, message: 'Invoice PDF file not found.' });
    }

    // Set header to display PDF in browser or download
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
    
    const fileStream = fs.createReadStream(filePath);
    fileStream.pipe(res);
  } catch (error: any) {
    return res.status(500).json({ success: false, message: 'Failed to download PDF.', error: error.message });
  }
});

/**
 * @route   POST /api/bills/:id/pay/upi-intent
 * @desc    Customer states they paid via direct UPI link; sets status to "verifying"
 * @access  Public
 */
router.post('/:id/pay/upi-intent', async (req, res) => {
  try {
    const bill = await Bill.findById(req.params.id);
    if (!bill) {
      return res.status(404).json({ success: false, message: 'Bill not found.' });
    }

    if (bill.paymentStatus === 'paid') {
      return res.status(400).json({ success: false, message: 'This bill has already been settled.' });
    }

    bill.paymentStatus = 'verifying';
    bill.paymentMethod = 'upi_link';
    await bill.save();

    // Broadcast update via socket so kitchen panel highlights it
    const io = req.app.get('io');
    const populatedBill = await Bill.findById(bill._id)
      .populate('orderId')
      .populate('restaurantId', 'name address contact gstNumber paymentSettings');

    if (io) {
      // Notify tracking customer room
      io.to(bill.orderId.toString()).emit('bill_status_updated', populatedBill);
      // Notify restaurant room to draw kitchen alert
      io.to(bill.restaurantId.toString()).emit('bill_payment_verifying', {
        billId: bill._id,
        billNumber: bill.billNumber,
        tableNumber: req.body.tableNumber || 'N/A',
        totalAmount: bill.totalAmount,
      });
    }

    return res.json({ success: true, message: 'Payment marked as verifying. Waiting for cashier approval.', data: populatedBill });
  } catch (error: any) {
    console.error('UPI payment intent error:', error);
    return res.status(500).json({ success: false, message: 'Failed to register UPI intent.', error: error.message });
  }
});

/**
 * @route   POST /api/bills/:id/pay/cash-intent
 * @desc    Customer states they will pay via cash; sets status to "verifying"
 * @access  Public
 */
router.post('/:id/pay/cash-intent', async (req, res) => {
  try {
    const bill = await Bill.findById(req.params.id);
    if (!bill) {
      return res.status(404).json({ success: false, message: 'Bill not found.' });
    }

    if (bill.paymentStatus === 'paid') {
      return res.status(400).json({ success: false, message: 'This bill has already been settled.' });
    }

    bill.paymentStatus = 'verifying';
    bill.paymentMethod = 'cash';
    await bill.save();

    // Broadcast update via socket so kitchen panel highlights it
    const io = req.app.get('io');
    const populatedBill = await Bill.findById(bill._id)
      .populate('orderId')
      .populate('restaurantId', 'name address contact gstNumber paymentSettings');

    if (io) {
      // Notify tracking customer room
      io.to(bill.orderId.toString()).emit('bill_status_updated', populatedBill);
      // Notify restaurant room to draw kitchen alert
      io.to(bill.restaurantId.toString()).emit('bill_payment_verifying', {
        billId: bill._id,
        billNumber: bill.billNumber,
        tableNumber: req.body.tableNumber || 'N/A',
        totalAmount: bill.totalAmount,
        paymentMethod: 'cash',
      });
    }

    return res.json({ success: true, message: 'Payment marked as verifying. Please pay cash at the counter.', data: populatedBill });
  } catch (error: any) {
    console.error('Cash payment intent error:', error);
    return res.status(500).json({ success: false, message: 'Failed to register cash intent.', error: error.message });
  }
});

/**
 * @route   POST /api/bills/:id/pay/approve
 * @desc    Cashier approves a verifying UPI payment or manual cash payment
 * @access  Private (Restaurant Admin / Staff)
 */
router.post('/:id/pay/approve', protect, restrictTo('restaurant_admin', 'staff'), async (req: AuthRequest, res: Response) => {
  try {
    const { paymentMethod } = req.body;
    
    const bill = await Bill.findById(req.params.id);
    if (!bill) {
      return res.status(404).json({ success: false, message: 'Bill not found.' });
    }

    bill.paymentStatus = 'paid';
    if (paymentMethod) {
      bill.paymentMethod = paymentMethod;
    }
    await bill.save();

    // Broadcast update via socket
    const io = req.app.get('io');
    const populatedBill = await Bill.findById(bill._id)
      .populate('orderId')
      .populate('restaurantId', 'name address contact gstNumber paymentSettings');

    if (io) {
      io.to(bill.orderId.toString()).emit('bill_status_updated', populatedBill);
      io.to(bill.restaurantId.toString()).emit('bill_payment_approved', { billId: bill._id });
      // Complete order as well if not already completed
      const order = await Order.findById(bill.orderId);
      if (order) {
        const normTable = canonicalTableKey(order.tableNumber);
        const otherOpenOrders = await Order.find({
          restaurantId: order.restaurantId,
          _id: { $ne: order._id },
          status: { $nin: ['completed', 'cancelled'] },
          $or: [
            { tableNumber: order.tableNumber },
            { tableNumber: normTable },
            { tableNumber: `Table ${normTable}` },
            { tableNumber: `T-${normTable}` },
          ],
        });

        if (otherOpenOrders.length > 0) {
          let mergedSubtotalDelta = 0;
          for (const otherOrder of otherOpenOrders) {
            order.items.push(...(otherOrder.items as any));
            mergedSubtotalDelta += otherOrder.subtotal || 0;

            otherOrder.status = 'cancelled';
            otherOrder.mergeNote = `[AUTO-CONSOLIDATED]: Merged into primary Order ${order._id} at bill approval on ${new Date().toISOString()}`;
            await otherOrder.save();

            const orphanBill = await Bill.findOne({ orderId: otherOrder._id });
            if (orphanBill) {
              orphanBill.paymentStatus = 'void';
              orphanBill.voidNote = `[AUTO-CONSOLIDATED]: Voided orphan bill merged into primary Order ${order._id}`;
              await orphanBill.save();
            }
          }
          order.subtotal = Number((order.subtotal + mergedSubtotalDelta).toFixed(2));
          const restaurant = await Restaurant.findById(order.restaurantId);
          const taxRate = restaurant?.taxRate !== undefined && restaurant?.taxRate !== null ? Number(restaurant.taxRate) : 5;
          order.tax = Number(((order.subtotal * taxRate) / 100).toFixed(2));
          order.totalAmount = Number((order.subtotal + order.tax).toFixed(2));

          bill.subtotal = order.subtotal;
          bill.tax = order.tax;
          bill.totalAmount = order.totalAmount;
          await bill.save();
        }

        order.status = 'completed';
        await order.save();

        await TableSession.updateOne(
          { restaurantId: order.restaurantId, tableNumber: normTable, status: 'active' },
          { $set: { status: 'grace', graceEndsAt: new Date(Date.now() + 10 * 60 * 1000) } }
        );

        // Automatically resolve any pending request_bill requests for this table
        await WaiterRequest.updateMany(
          { restaurantId: order.restaurantId, tableNumber: order.tableNumber, type: 'request_bill', status: 'pending' },
          { status: 'resolved' }
        );

        io.to(bill.restaurantId.toString()).emit('order_updated', order);
        io.to(bill.restaurantId.toString()).emit('table_status_updated', { tableNumber: order.tableNumber });
      }
    }

    return res.json({ success: true, message: 'Payment approved successfully.', data: populatedBill });
  } catch (error: any) {
    console.error('Approve payment error:', error);
    return res.status(500).json({ success: false, message: 'Failed to approve payment.', error: error.message });
  }
});

export default router;
