import { Router, Response } from 'express';
import Table from '../models/Table';
import Restaurant from '../models/Restaurant';
import { generateQRCodeDataURL } from '../utils/qr';
import { protect, restrictTo, AuthRequest } from '../middleware/auth';

const router = Router();

/**
 * @route   GET /api/tables
 * @desc    Get all tables for the logged-in restaurant tenant
 * @access  Private (Restaurant Admin / Staff)
 */
router.get('/', protect, restrictTo('restaurant_admin', 'staff'), async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user || !req.user.restaurantId) {
      return res.status(400).json({ success: false, message: 'User is not associated with any restaurant.' });
    }

    const tables = await Table.find({ restaurantId: req.user.restaurantId }).sort({ tableNumber: 1 }).lean();
    return res.json({ success: true, count: tables.length, data: tables });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: 'Failed to retrieve tables.', error: error.message });
  }
});

/**
 * @route   POST /api/tables
 * @desc    Add a table and generate its dynamic QR code pointing to the menu page
 * @access  Private (Restaurant Admin only)
 */
router.post('/', protect, restrictTo('restaurant_admin'), async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user || !req.user.restaurantId) {
      return res.status(400).json({ success: false, message: 'User is not associated with any restaurant.' });
    }

    const { tableNumber } = req.body;
    if (!tableNumber) {
      return res.status(400).json({ success: false, message: 'Table number is required.' });
    }

    // Check if table already exists for this restaurant
    const existingTable = await Table.findOne({
      restaurantId: req.user.restaurantId,
      tableNumber: tableNumber.trim(),
    });

    if (existingTable) {
      return res.status(400).json({ success: false, message: `Table ${tableNumber} already exists.` });
    }

    // Fetch restaurant slug to construct the client menu path
    const restaurant = await Restaurant.findById(req.user.restaurantId);
    if (!restaurant) {
      return res.status(404).json({ success: false, message: 'Associated restaurant tenant not found.' });
    }

    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    const menuTableUrl = `${frontendUrl}/r/${restaurant.slug}/menu/table/${tableNumber.trim()}`;

    // Generate dynamic QR Code Base64
    const qrCodeBase64 = await generateQRCodeDataURL(menuTableUrl);

    // Save Table
    const table = new Table({
      restaurantId: req.user.restaurantId,
      tableNumber: tableNumber.trim(),
      qrCodeUrl: qrCodeBase64,
    });

    await table.save();

    return res.status(201).json({
      success: true,
      message: `Table ${tableNumber} added and QR code generated.`,
      data: table,
    });
  } catch (error: any) {
    console.error('Error adding table:', error);
    return res.status(500).json({ success: false, message: 'Failed to add table and generate QR.', error: error.message });
  }
});

/**
 * @route   DELETE /api/tables/:id
 * @desc    Remove a table
 * @access  Private (Restaurant Admin only)
 */
router.delete('/:id', protect, restrictTo('restaurant_admin'), async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user || !req.user.restaurantId) {
      return res.status(400).json({ success: false, message: 'User is not associated with any restaurant.' });
    }

    const table = await Table.findOneAndDelete({
      _id: req.params.id,
      restaurantId: req.user.restaurantId,
    });

    if (!table) {
      return res.status(404).json({ success: false, message: 'Table not found in your restaurant.' });
    }

    return res.json({ success: true, message: `Table ${table.tableNumber} deleted successfully.` });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: 'Failed to delete table.', error: error.message });
  }
});

export default router;
