import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import User from '../models/User';
import Restaurant from '../models/Restaurant';
import Otp from '../models/Otp';
import Table from '../models/Table';
import Dish from '../models/Dish';
import { generateQRCodeDataURL } from '../utils/qr';
import { generateOTP, sendOTP } from '../utils/otp';
import { protect, restrictTo, AuthRequest } from '../middleware/auth';

const router = Router();

const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret-key-1234';

/**
 * @route   POST /api/auth/register-restaurant
 * @desc    Sign up a new restaurant tenant and create its administrator
 * @access  Public
 */
router.post('/register-restaurant', async (req: Request, res: Response) => {
  try {
    const { restaurantName, address, contact, slug, adminName, email, password } = req.body;

    if (!restaurantName || !address || !contact || !slug || !adminName || !email || !password) {
      return res.status(400).json({ success: false, message: 'All fields are required.' });
    }

    // Check slug uniqueness
    const existingRestaurant = await Restaurant.findOne({ slug: slug.toLowerCase() });
    if (existingRestaurant) {
      return res.status(400).json({ success: false, message: 'Restaurant URL slug is already taken.' });
    }

    // Check user uniqueness
    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      return res.status(400).json({ success: false, message: 'Email is already registered.' });
    }

    // Create Restaurant
    const restaurant = new Restaurant({
      name: restaurantName,
      slug: slug.toLowerCase().replace(/[^a-z0-9-_]/g, ''),
      address,
      contact,
      status: 'active',
    });
    await restaurant.save();

    // Hash password and create Admin User
    const hashedPassword = await bcrypt.hash(password, 10);
    const user = new User({
      name: adminName,
      email: email.toLowerCase(),
      password: hashedPassword,
      role: 'restaurant_admin',
      restaurantId: restaurant._id,
    });
    await user.save();

    // Create JWT token
    const token = jwt.sign({ id: user._id }, JWT_SECRET, { expiresIn: '7d' });

    return res.status(201).json({
      success: true,
      message: 'Restaurant registered successfully.',
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        restaurantId: user.restaurantId,
      },
      restaurant,
    });
  } catch (error: any) {
    console.error('Registration error:', error);
    return res.status(500).json({ success: false, message: 'Internal server error.', error: error.message });
  }
});

/**
 * Helper to ensure the default Super Admin account exists idempotently without wiping existing database data
 */
export const ensureSuperAdmin = async () => {
  try {
    const superAdminEmail = 'superadmin@cafeflow.com';
    let user = await User.findOne({ email: superAdminEmail });

    if (!user) {
      const hashedPassword = await bcrypt.hash('superadmin123', 10);
      user = new User({
        name: 'CafeFlow Admin',
        email: superAdminEmail,
        password: hashedPassword,
        role: 'super_admin',
      });
      await user.save();
      console.log('[Auth] Super Admin account created: superadmin@cafeflow.com');
    } else {
      const isMatch = await bcrypt.compare('superadmin123', user.password || '');
      if (!isMatch || user.role !== 'super_admin') {
        user.password = await bcrypt.hash('superadmin123', 10);
        user.role = 'super_admin';
        await user.save();
        console.log('[Auth] Super Admin account password/role synchronized.');
      }
    }
  } catch (error) {
    console.error('[Auth] Failed to ensure Super Admin account:', error);
  }
};

/**
 * @route   GET /api/auth/ensure-superadmin
 * @desc    Safely initialize/verify Super Admin account idempotently without touching other data
 * @access  Public
 */
router.get('/ensure-superadmin', async (req: Request, res: Response) => {
  try {
    await ensureSuperAdmin();
    return res.json({ success: true, message: 'Super Admin account verified and active.' });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: 'Failed to ensure Super Admin.', error: error.message });
  }
});

/**
 * @route   GET /api/auth/seed
 * @desc    Seed the database with sample data if it is empty
 * @access  Public
 */
router.get('/seed', async (req: Request, res: Response) => {
  try {
    // 1. Check if database is empty or force flag is active
    const force = req.query.force === 'true';
    const restaurantCount = await Restaurant.countDocuments();
    if (restaurantCount > 0 && !force) {
      return res.status(400).json({
        success: false,
        message: 'Database is not empty. Seeding is disabled to prevent overwriting existing data. Use ?force=true to override.',
      });
    }

    console.log('[API Seeder] Starting database seeding...');

    if (force) {
      console.log('[API Seeder] Force flag active. Cleaning existing collections...');
      await Restaurant.deleteMany({});
      await User.deleteMany({});
      await Table.deleteMany({});
      await Dish.deleteMany({});
    }

    // 2. Create Restaurant Tenant
    const cafe = new Restaurant({
      name: 'Central Cafe & Bistro',
      slug: 'central-cafe',
      logo: 'https://images.unsplash.com/photo-1501339847302-ac426a4a7cbb?q=80&w=300&auto=format&fit=crop',
      address: '102 Gourmet Boulevard, Food District, Suite 5',
      contact: '+91 98765 43210',
      gstNumber: '29AAAAA1111A1Z1',
      taxRate: 5, // 5% GST
      theme: {
        primaryColor: '#d97706', // Warm Amber
        darkMode: false,
      },
      status: 'active',
    });
    await cafe.save();

    // 3. Create Users
    const hashedSuperAdminPassword = await bcrypt.hash('superadmin123', 10);
    const hashedAdminPassword = await bcrypt.hash('admin123', 10);
    const hashedStaffPassword = await bcrypt.hash('staff123', 10);

    const superAdmin = new User({
      name: 'CafeFlow Admin',
      email: 'superadmin@cafeflow.com',
      password: hashedSuperAdminPassword,
      role: 'super_admin',
    });

    const restaurantAdmin = new User({
      name: 'Sarah Jenkins',
      email: 'admin@centralcafe.com',
      password: hashedAdminPassword,
      role: 'restaurant_admin',
      restaurantId: cafe._id,
    });

    const restaurantStaff = new User({
      name: 'David Miller',
      email: 'staff@centralcafe.com',
      password: hashedStaffPassword,
      role: 'staff',
      restaurantId: cafe._id,
    });

    await superAdmin.save();
    await restaurantAdmin.save();
    await restaurantStaff.save();

    // 4. Create Tables and QR Codes
    const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';
    const tablesToCreate = ['1', '2', '3', '4', '5'];
    for (const tableNum of tablesToCreate) {
      const menuUrl = `${FRONTEND_URL}/r/${cafe.slug}/menu/table/${tableNum}`;
      const qrCodeData = await generateQRCodeDataURL(menuUrl);

      const table = new Table({
        restaurantId: cafe._id,
        tableNumber: tableNum,
        qrCodeUrl: qrCodeData,
      });
      await table.save();
    }

    // 5. Create Dishes
    const sampleDishes = [
      {
        name: 'Himalayan French Roast',
        description: 'Rich dark espresso roast brewed from organically farmed single-origin Nepalese beans.',
        price: 180,
        category: 'Coffee',
        veg: true,
        image: 'https://images.unsplash.com/photo-1509042239860-f550ce710b93?q=80&w=400&auto=format&fit=crop',
        customizations: [
          {
            name: 'Sugar Level',
            type: 'single',
            options: [
              { name: 'Normal Sugar', extraPrice: 0 },
              { name: 'Less Sugar', extraPrice: 0 },
              { name: 'No Sugar', extraPrice: 0 },
            ],
          },
        ],
      },
      {
        name: 'Spiced Pumpkin Latte',
        description: 'Creamy espresso blended with autumn pumpkin spices and steamed rich milk, topped with whip.',
        price: 220,
        category: 'Coffee',
        veg: true,
        image: 'https://images.unsplash.com/photo-1544787219-7f47ccb76574?q=80&w=400&auto=format&fit=crop',
        customizations: [
          {
            name: 'Milk Type',
            type: 'single',
            options: [
              { name: 'Whole Milk', extraPrice: 0 },
              { name: 'Oat Milk', extraPrice: 40 },
              { name: 'Almond Milk', extraPrice: 50 },
            ],
          },
        ],
      },
      {
        name: 'Darjeeling First Flush',
        description: 'Delicate floral black tea hand-plucked in spring from high-altitude Darjeeling estates.',
        price: 150,
        category: 'Tea',
        veg: true,
        image: 'https://images.unsplash.com/photo-1576092768241-dec231879fc3?q=80&w=400&auto=format&fit=crop',
        customizations: [
          {
            name: 'Sweetener',
            type: 'single',
            options: [
              { name: 'White Sugar', extraPrice: 0 },
              { name: 'Organic Honey', extraPrice: 20 },
              { name: 'No Sugar', extraPrice: 0 },
            ],
          },
        ],
      },
      {
        name: 'Classic Virgin Mojito',
        description: 'Refreshing muddle of fresh garden mint, lime wedges, pure sugarcane juice, and sparkling soda.',
        price: 160,
        category: 'Mocktails',
        veg: true,
        image: 'https://images.unsplash.com/photo-1513558161293-cdaf765ed2fd?q=80&w=400&auto=format&fit=crop',
        customizations: [],
      },
      {
        name: 'Avocado Sourdough Toast',
        description: 'Artisanal sourdough toast topped with fresh crushed avocado, cherry tomatoes, and microgreens.',
        price: 280,
        category: 'Breakfast',
        veg: true,
        image: 'https://images.unsplash.com/photo-1525351484163-7529414344d8?q=80&w=400&auto=format&fit=crop',
        customizations: [
          {
            name: 'Add-Ons',
            type: 'multiple',
            options: [
              { name: 'Extra Cheese', extraPrice: 30 },
              { name: 'Poached Egg', extraPrice: 40 },
              { name: 'Extra Avocado', extraPrice: 60 },
            ],
          },
        ],
      },
      {
        name: 'Crispy Peri-Peri Fries',
        description: 'Golden double-fried Idaho potatoes tossed in a spicy, tangy African bird eye pepper seasoning.',
        price: 140,
        category: 'Snacks',
        veg: true,
        image: 'https://images.unsplash.com/photo-1573080496219-bb080dd4f877?q=80&w=400&auto=format&fit=crop',
        customizations: [
          {
            name: 'Sauce Dip',
            type: 'multiple',
            options: [
              { name: 'Cheesy Dip', extraPrice: 25 },
              { name: 'Chipotle Mayo', extraPrice: 20 },
            ],
          },
        ],
      },
      {
        name: 'Penne Arrabiata Pasta',
        description: 'Penne tossed in a fiery Italian plum tomato sauce with fresh basil, garlic, and extra virgin olive oil.',
        price: 320,
        category: 'Lunch',
        veg: true,
        image: 'https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?q=80&w=400&auto=format&fit=crop',
        customizations: [
          {
            name: 'Spice Level',
            type: 'single',
            options: [
              { name: 'Mild', extraPrice: 0 },
              { name: 'Medium', extraPrice: 0 },
              { name: 'Spicy', extraPrice: 0 },
              { name: 'Extra Spicy', extraPrice: 0 },
            ],
          },
          {
            name: 'Add-Ons',
            type: 'multiple',
            options: [
              { name: 'Grated Mozzarella', extraPrice: 40 },
              { name: 'Mushrooms & Olives', extraPrice: 50 },
            ],
          },
        ],
      },
      {
        name: 'Pan-Seared Salmon Fillet',
        description: 'Premium Atlantic salmon fillet seared to perfection, served with asparagus and roasted baby potatoes.',
        price: 540,
        category: 'Dinner',
        veg: false,
        image: 'https://images.unsplash.com/photo-1485962398705-ef6a13c41e8f?q=80&w=400&auto=format&fit=crop',
        customizations: [
          {
            name: 'Butter Prep',
            type: 'single',
            options: [
              { name: 'Herb Garlic Butter', extraPrice: 0 },
              { name: 'Lemon Dill Butter', extraPrice: 0 },
            ],
          },
        ],
      },
      {
        name: 'Molten Choco Lava Cake',
        description: 'Decadent warm dark chocolate cake filled with a gooey liquid core, served with vanilla bean gelato.',
        price: 190,
        category: 'Desserts',
        veg: true,
        image: 'https://images.unsplash.com/photo-1606313564200-e75d5e30476c?q=80&w=400&auto=format&fit=crop',
        customizations: [
          {
            name: 'Extras',
            type: 'multiple',
            options: [
              { name: 'Extra Chocolate Fudge', extraPrice: 30 },
              { name: 'Add Gelato Scoop', extraPrice: 50 },
            ],
          },
        ],
      },
    ];

    for (const item of sampleDishes) {
      const dish = new Dish({
        restaurantId: cafe._id,
        ...item,
        available: true,
      });
      await dish.save();
    }

    console.log('[API Seeder] Database seeding completed successfully.');
    return res.status(201).json({
      success: true,
      message: 'Demo data seeded successfully!',
    });
  } catch (error: any) {
    console.error('[API Seeder] Seeding error:', error);
    return res.status(500).json({
      success: false,
      message: 'Seeding failed.',
      error: error.message,
    });
  }
});

/**
 * @route   POST /api/auth/login
 * @desc    Authenticate admin or staff user and return token
 * @access  Public
 */
router.post('/login', async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Please provide email and password.' });
    }

    const user = await User.findOne({ email: String(email).trim().toLowerCase() });
    if (!user) {
      return res.status(401).json({ success: false, message: 'Invalid credentials.' });
    }

    const isMatch = await bcrypt.compare(password, user.password || '');
    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Invalid credentials.' });
    }

    // Load tenant details if associated
    let restaurantObj = null;
    if (user.restaurantId) {
      restaurantObj = await Restaurant.findById(user.restaurantId);
      if (restaurantObj && restaurantObj.status === 'suspended') {
        return res.status(403).json({ success: false, message: 'Your restaurant tenant has been suspended.' });
      }
    }

    const token = jwt.sign({ id: user._id }, JWT_SECRET, { expiresIn: '7d' });

    return res.json({
      success: true,
      message: 'Login successful.',
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        restaurantId: user.restaurantId,
      },
      restaurant: restaurantObj,
    });
  } catch (error: any) {
    console.error('Login error:', error);
    return res.status(500).json({ success: false, message: 'Internal server error.', error: error.message });
  }
});

/**
 * @route   POST /api/auth/otp/send
 * @desc    Generate and send 6 digit OTP to customer number
 * @access  Public (Customer context)
 */
router.post('/otp/send', async (req: Request, res: Response) => {
  try {
    const { phoneNumber } = req.body;
    if (!phoneNumber) {
      return res.status(400).json({ success: false, message: 'Phone number is required.' });
    }

    // Clean formatting
    const formattedPhone = phoneNumber.trim();

    // Create 6-digit OTP and hash it before storing
    const otpCode = generateOTP();
    const hashedOtp = await bcrypt.hash(otpCode, 10);
    const expiresAt = new Date(Date.now() + 2 * 60 * 1000); // 2 minutes expiry

    // Save hashed OTP to Database (upsert to overwrite active OTPs for the phone)
    await Otp.findOneAndUpdate(
      { phoneNumber: formattedPhone },
      { otp: hashedOtp, expiresAt, verified: false },
      { upsert: true, new: true }
    );

    // Call service to send the plain OTP via SMS/Mock console
    await sendOTP(formattedPhone, otpCode);

    return res.json({
      success: true,
      message: 'OTP sent successfully. Valid for 2 minutes.',
    });
  } catch (error: any) {
    console.error('[OTP Send] Error:', error);
    return res.status(500).json({ success: false, message: 'Failed to send OTP.', error: error.message });
  }
});

/**
 * @route   POST /api/auth/otp/verify
 * @desc    Verify customer 6 digit OTP
 * @access  Public (Customer context)
 */
router.post('/otp/verify', async (req: Request, res: Response) => {
  try {
    const { phoneNumber, otp } = req.body;
    if (!phoneNumber || !otp) {
      return res.status(400).json({ success: false, message: 'Phone number and OTP code are required.' });
    }

    const formattedPhone = phoneNumber.trim();

    // Find the latest active OTP
    const otpRecord = await Otp.findOne({ phoneNumber: formattedPhone });
    if (!otpRecord) {
      return res.status(400).json({ success: false, message: 'No OTP requested for this phone number.' });
    }

    // Validate expiration
    if (new Date() > otpRecord.expiresAt) {
      return res.status(400).json({ success: false, message: 'OTP has expired. Please request a new one.' });
    }

    // Validate correctness using bcrypt compare (OTP is stored hashed)
    const isOtpValid = await bcrypt.compare(otp.trim(), otpRecord.otp);
    if (!isOtpValid) {
      return res.status(400).json({ success: false, message: 'Incorrect OTP. Please try again.' });
    }

    // Mark as verified
    otpRecord.verified = true;
    await otpRecord.save();

    return res.json({
      success: true,
      message: 'Phone number verified successfully.',
    });
  } catch (error: any) {
    console.error('[OTP Verify] Error:', error);
    return res.status(500).json({ success: false, message: 'Failed to verify OTP.', error: error.message });
  }
});

/**
 * @route   GET /api/auth/me
 * @desc    Get details of current logged in user
 * @access  Private
 */
router.get('/me', protect, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'Unauthorized.' });
    }

    // Fetch full restaurant details if applicable
    let restaurantObj = null;
    if (req.user.restaurantId) {
      restaurantObj = await Restaurant.findById(req.user.restaurantId);
    }

    return res.json({
      success: true,
      user: {
        id: req.user._id,
        name: req.user.name,
        email: req.user.email,
        role: req.user.role,
        restaurantId: req.user.restaurantId,
      },
      restaurant: restaurantObj,
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: 'Internal server error.' });
  }
});

export default router;
