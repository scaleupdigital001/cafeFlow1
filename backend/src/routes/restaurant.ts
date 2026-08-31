import { Router, Response } from 'express';
import Restaurant from '../models/Restaurant';
import { protect, restrictTo, AuthRequest } from '../middleware/auth';

const router = Router();

/**
 * @route   GET /api/restaurants
 * @desc    Get a list of all restaurants in the SaaS system
 * @access  Private (Super Admin only)
 */
router.get('/', protect, restrictTo('super_admin'), async (req: AuthRequest, res: Response) => {
  try {
    const restaurants = await Restaurant.find().sort({ createdAt: -1 });
    return res.json({ success: true, count: restaurants.length, data: restaurants });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: 'Failed to retrieve restaurants.', error: error.message });
  }
});

/**
 * @route   GET /api/restaurants/slug/:slug
 * @desc    Public route to get restaurant details by slug (landing page & customer flow)
 * @access  Public
 */
router.get('/slug/:slug', async (req, res) => {
  try {
    const restaurant = await Restaurant.findOne({ slug: req.params.slug.toLowerCase() });
    if (!restaurant) {
      return res.status(404).json({ success: false, message: 'Restaurant not found.' });
    }
    
    if (restaurant.status === 'suspended') {
      return res.status(403).json({ success: false, message: 'This restaurant is currently suspended.' });
    }

    return res.json({ success: true, data: restaurant });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: 'Failed to fetch restaurant.', error: error.message });
  }
});

/**
 * @route   GET /api/restaurants/my-restaurant
 * @desc    Get the logged in user's restaurant details
 * @access  Private (Restaurant Admin / Staff)
 */
router.get('/my-restaurant', protect, restrictTo('restaurant_admin', 'staff'), async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user || !req.user.restaurantId) {
      return res.status(400).json({ success: false, message: 'User is not associated with any restaurant.' });
    }

    const restaurant = await Restaurant.findById(req.user.restaurantId);
    if (!restaurant) {
      return res.status(404).json({ success: false, message: 'Restaurant not found.' });
    }

    return res.json({ success: true, data: restaurant });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: 'Failed to fetch restaurant.', error: error.message });
  }
});

/**
 * @route   PATCH /api/restaurants/my-restaurant
 * @desc    Update logged-in restaurant details
 * @access  Private (Restaurant Admin only)
 */
router.patch('/my-restaurant', protect, restrictTo('restaurant_admin'), async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user || !req.user.restaurantId) {
      return res.status(400).json({ success: false, message: 'User is not associated with any restaurant.' });
    }

    const { name, logo, address, contact, gstNumber, taxRate, theme, location, paymentSettings } = req.body;

    const updatedFields: any = {};
    if (name) updatedFields.name = name;
    if (logo !== undefined) updatedFields.logo = logo;
    if (address) updatedFields.address = address;
    if (contact) updatedFields.contact = contact;
    if (gstNumber !== undefined) updatedFields.gstNumber = gstNumber;
    if (taxRate !== undefined) updatedFields.taxRate = Number(taxRate);
    if (theme) {
      updatedFields.theme = {
        primaryColor: theme.primaryColor || '#d97706',
        darkMode: theme.darkMode ?? false,
      };
    }
    if (location) {
      updatedFields.location = {
        latitude: Number(location.latitude),
        longitude: Number(location.longitude),
      };
    }
    if (paymentSettings) {
      updatedFields.paymentSettings = {
        upiId: paymentSettings.upiId || '',
        upiPhone: paymentSettings.upiPhone || '',
        upiQrImage: paymentSettings.upiQrImage || '',
      };
    }

    const restaurant = await Restaurant.findByIdAndUpdate(
      req.user.restaurantId,
      { $set: updatedFields },
      { new: true, runValidators: true }
    );

    if (!restaurant) {
      return res.status(404).json({ success: false, message: 'Restaurant not found.' });
    }

    const io = req.app.get('io');
    if (io) {
      io.to(req.user.restaurantId.toString()).emit('restaurant_updated', restaurant);
      console.log(`[Socket] Dispatched restaurant_updated event for: ${req.user.restaurantId}`);
    }

    return res.json({ success: true, message: 'Restaurant settings updated.', data: restaurant });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: 'Failed to update restaurant settings.', error: error.message });
  }
});

/**
 * @route   PATCH /api/restaurants/:id/status
 * @desc    Update status (active / suspended) of any restaurant
 * @access  Private (Super Admin only)
 */
router.patch('/:id/status', protect, restrictTo('super_admin'), async (req: AuthRequest, res: Response) => {
  try {
    const { status } = req.body;
    if (!['active', 'suspended'].includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid status value.' });
    }

    const restaurant = await Restaurant.findByIdAndUpdate(
      req.params.id,
      { $set: { status } },
      { new: true }
    );

    if (!restaurant) {
      return res.status(404).json({ success: false, message: 'Restaurant not found.' });
    }

    return res.json({ success: true, message: `Restaurant is now ${status}.`, data: restaurant });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: 'Failed to update status.', error: error.message });
  }
});

export default router;
