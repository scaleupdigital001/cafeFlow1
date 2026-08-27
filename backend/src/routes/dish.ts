import { Router, Response } from 'express';
import Dish from '../models/Dish';
import Restaurant from '../models/Restaurant';
import { protect, restrictTo, AuthRequest } from '../middleware/auth';

const router = Router();

/**
 * @route   GET /api/dishes/slug/:slug
 * @desc    Public route to get all dishes for a restaurant using its URL slug
 * @access  Public
 */
router.get('/slug/:slug', async (req, res) => {
  try {
    const restaurant = await Restaurant.findOne({ slug: req.params.slug.toLowerCase() });
    if (!restaurant) {
      return res.status(404).json({ success: false, message: 'Restaurant not found.' });
    }

    const dishes = await Dish.find({ restaurantId: restaurant._id });
    return res.json({ success: true, count: dishes.length, data: dishes });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: 'Failed to retrieve menu dishes.', error: error.message });
  }
});

/**
 * @route   GET /api/dishes/my-restaurant
 * @desc    Get all dishes for the logged-in restaurant tenant
 * @access  Private (Restaurant Admin / Staff)
 */
router.get('/my-restaurant', protect, restrictTo('restaurant_admin', 'staff'), async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user || !req.user.restaurantId) {
      return res.status(400).json({ success: false, message: 'User is not associated with any restaurant.' });
    }

    const dishes = await Dish.find({ restaurantId: req.user.restaurantId }).sort({ createdAt: -1 });
    return res.json({ success: true, count: dishes.length, data: dishes });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: 'Failed to retrieve menu dishes.', error: error.message });
  }
});

/**
 * @route   GET /api/dishes/restaurant/:restaurantId
 * @desc    Public route to get all dishes for a restaurant using ID
 * @access  Public
 */
router.get('/restaurant/:restaurantId', async (req, res) => {
  try {
    const dishes = await Dish.find({ restaurantId: req.params.restaurantId });
    return res.json({ success: true, count: dishes.length, data: dishes });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: 'Failed to retrieve menu dishes.', error: error.message });
  }
});

/**
 * @route   POST /api/dishes
 * @desc    Create a new dish in the menu
 * @access  Private (Restaurant Admin only)
 */
router.post('/', protect, restrictTo('restaurant_admin'), async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user || !req.user.restaurantId) {
      return res.status(400).json({ success: false, message: 'User is not associated with any restaurant.' });
    }

    const { name, description, image, category, price, veg, customizations } = req.body;

    if (!name || !category || price === undefined) {
      return res.status(400).json({ success: false, message: 'Name, category, and price are required fields.' });
    }

    const dish = new Dish({
      restaurantId: req.user.restaurantId,
      name,
      description,
      image,
      category,
      price: Number(price),
      veg: veg ?? true,
      available: true,
      customizations: customizations || [],
    });

    await dish.save();
    return res.status(201).json({ success: true, message: 'Dish added to menu.', data: dish });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: 'Failed to add dish.', error: error.message });
  }
});

/**
 * @route   PATCH /api/dishes/:id
 * @desc    Edit details of a menu dish
 * @access  Private (Restaurant Admin only)
 */
router.patch('/:id', protect, restrictTo('restaurant_admin'), async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user || !req.user.restaurantId) {
      return res.status(400).json({ success: false, message: 'User is not associated with any restaurant.' });
    }

    const dish = await Dish.findOne({ _id: req.params.id, restaurantId: req.user.restaurantId });
    if (!dish) {
      return res.status(404).json({ success: false, message: 'Dish not found in your restaurant menu.' });
    }

    const { name, description, image, category, price, veg, available, customizations } = req.body;

    if (name) dish.name = name;
    if (description !== undefined) dish.description = description;
    if (image !== undefined) dish.image = image;
    if (category) dish.category = category;
    if (price !== undefined) dish.price = Number(price);
    if (veg !== undefined) dish.veg = veg;
    if (available !== undefined) dish.available = available;
    if (customizations !== undefined) dish.customizations = customizations;

    await dish.save();
    return res.json({ success: true, message: 'Dish details updated.', data: dish });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: 'Failed to edit dish.', error: error.message });
  }
});

/**
 * @route   PATCH /api/dishes/:id/toggle-availability
 * @desc    Quick toggle to change whether a dish is available
 * @access  Private (Restaurant Admin / Staff)
 */
router.patch('/:id/toggle-availability', protect, restrictTo('restaurant_admin', 'staff'), async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user || !req.user.restaurantId) {
      return res.status(400).json({ success: false, message: 'User is not associated with any restaurant.' });
    }

    const dish = await Dish.findOne({ _id: req.params.id, restaurantId: req.user.restaurantId });
    if (!dish) {
      return res.status(404).json({ success: false, message: 'Dish not found in your restaurant menu.' });
    }

    dish.available = !dish.available;
    await dish.save();

    return res.json({
      success: true,
      message: `Dish availability marked as ${dish.available ? 'Available' : 'Out of Stock'}.`,
      data: dish,
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: 'Failed to toggle availability.', error: error.message });
  }
});

/**
 * @route   DELETE /api/dishes/:id
 * @desc    Delete a dish from the menu
 * @access  Private (Restaurant Admin only)
 */
router.delete('/:id', protect, restrictTo('restaurant_admin'), async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user || !req.user.restaurantId) {
      return res.status(400).json({ success: false, message: 'User is not associated with any restaurant.' });
    }

    const dish = await Dish.findOneAndDelete({ _id: req.params.id, restaurantId: req.user.restaurantId });
    if (!dish) {
      return res.status(404).json({ success: false, message: 'Dish not found in your restaurant menu.' });
    }

    return res.json({ success: true, message: 'Dish deleted successfully from the menu.' });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: 'Failed to delete dish.', error: error.message });
  }
});

export default router;
