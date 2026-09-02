import { Router, Response } from 'express';
import QT from '../models/QT';
import { protect, restrictTo, AuthRequest } from '../middleware/auth';
import { canonicalTableKey } from '../utils/tableUtils';

const router = Router();

/**
 * @route   GET /api/qt
 * @desc    Get QTs (Kitchen Order Tickets) for logged-in tenant, filterable by status & tableNumber, most recent first
 * @access  Private (Restaurant Admin / Staff / Super Admin)
 */
router.get('/', protect, restrictTo('restaurant_admin', 'staff', 'super_admin'), async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.user?.restaurantId || req.query.restaurantId;
    if (!tenantId) {
      return res.status(400).json({ success: false, message: 'Tenant identifier is required.' });
    }

    const { status, tableNumber } = req.query;

    const filterQuery: any = {
      tenantId,
    };

    if (status && ['pending', 'printed', 'served', 'cleared'].includes(String(status))) {
      filterQuery.status = String(status);
    } else {
      // By default, exclude "cleared" QTs from active queue views
      filterQuery.status = { $ne: 'cleared' };
    }

    if (tableNumber) {
      const normTable = canonicalTableKey(String(tableNumber));
      const rawTableStr = String(tableNumber).trim();
      const digits = rawTableStr.replace(/\D/g, '');
      const variants = [rawTableStr, normTable];
      if (digits) {
        variants.push(digits);
        variants.push(`Table ${digits}`);
        variants.push(`T-${digits}`);
        variants.push(`T${digits}`);
      }
      filterQuery.tableNumber = { $in: Array.from(new Set(variants)) };
    }

    const qts = await QT.find(filterQuery).sort({ createdAt: -1 }).lean();

    return res.json({
      success: true,
      count: qts.length,
      data: qts,
    });
  } catch (error: any) {
    console.error('Fetch QTs error:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch Quick Tickets.', error: error.message });
  }
});

/**
 * @route   PATCH /api/qt/:id/status
 * @desc    Update QT status (pending | printed | served)
 * @access  Private (Restaurant Admin / Staff / Super Admin)
 */
router.patch('/:id/status', protect, restrictTo('restaurant_admin', 'staff', 'super_admin'), async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.user?.restaurantId;
    const { status } = req.body;

    if (!['pending', 'printed', 'served'].includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid status value. Must be pending, printed, or served.' });
    }

    const filterQuery: any = { _id: req.params.id };
    if (tenantId) {
      filterQuery.tenantId = tenantId;
    }

    const qt = await QT.findOne(filterQuery);
    if (!qt) {
      return res.status(404).json({ success: false, message: 'Quick Ticket not found.' });
    }

    qt.status = status;
    await qt.save();

    const io = req.app.get('io');
    if (io) {
      io.to(qt.tenantId.toString()).emit('qt_status_updated', qt);
    }

    return res.json({
      success: true,
      message: `QT marked as ${status}.`,
      data: qt,
    });
  } catch (error: any) {
    console.error('Update QT status error:', error);
    return res.status(500).json({ success: false, message: 'Failed to update Quick Ticket status.', error: error.message });
  }
});

/**
 * @route   PATCH /api/qt/:id/printed
 * @desc    Convenience endpoint to mark QT as "printed"
 * @access  Private (Restaurant Admin / Staff / Super Admin)
 */
router.patch('/:id/printed', protect, restrictTo('restaurant_admin', 'staff', 'super_admin'), async (req: AuthRequest, res: Response) => {
  req.body = req.body || {};
  req.body.status = 'printed';
  // Forward to status handler logic
  try {
    const tenantId = req.user?.restaurantId;
    const filterQuery: any = { _id: req.params.id };
    if (tenantId) filterQuery.tenantId = tenantId;

    const qt = await QT.findOne(filterQuery);
    if (!qt) {
      return res.status(404).json({ success: false, message: 'Quick Ticket not found.' });
    }

    qt.status = 'printed';
    await qt.save();

    const io = req.app.get('io');
    if (io) {
      io.to(qt.tenantId.toString()).emit('qt_status_updated', qt);
    }

    return res.json({
      success: true,
      message: 'QT marked as printed.',
      data: qt,
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: 'Failed to mark QT as printed.', error: error.message });
  }
});

/**
 * @route   PATCH /api/qt/:id/served
 * @desc    Convenience endpoint to mark QT as "served"
 * @access  Private (Restaurant Admin / Staff / Super Admin)
 */
router.patch('/:id/served', protect, restrictTo('restaurant_admin', 'staff', 'super_admin'), async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.user?.restaurantId;
    const filterQuery: any = { _id: req.params.id };
    if (tenantId) filterQuery.tenantId = tenantId;

    const qt = await QT.findOne(filterQuery);
    if (!qt) {
      return res.status(404).json({ success: false, message: 'Quick Ticket not found.' });
    }

    qt.status = 'served';
    await qt.save();

    const io = req.app.get('io');
    if (io) {
      io.to(qt.tenantId.toString()).emit('qt_status_updated', qt);
    }

    return res.json({
      success: true,
      message: 'QT marked as served.',
      data: qt,
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: 'Failed to mark QT as served.', error: error.message });
  }
});

export default router;
