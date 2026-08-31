import { Router, Response } from 'express';
import Order from '../models/Order';
import Dish from '../models/Dish';
import Restaurant from '../models/Restaurant';
import Otp from '../models/Otp';
import Bill from '../models/Bill';
import WaiterRequest from '../models/WaiterRequest';
import { generateBillPDF } from '../utils/pdf';
import { protect, restrictTo, AuthRequest } from '../middleware/auth';

const router = Router();

/**
 * Helper to generate a unique invoice code
 */
const generateBillNumber = (): string => {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `INV-${year}${month}${day}-${rand}`;
};

/**
 * Calculates distance between two coordinates in meters using Haversine formula
 */
const getDistanceInMeters = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
  const R = 6371e3; // Earth radius in meters
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
  const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c; // in meters
};

/**
 * @route   POST /api/orders
 * @desc    Place an order after optional location validation (replaces phone verification)
 * @access  Public
 */
router.post('/', async (req, res) => {
  try {
    const { restaurantId, customerName, phoneNumber, tableNumber, items, latitude, longitude } = req.body;

    if (!restaurantId || !customerName || !phoneNumber || !tableNumber || !items || !items.length) {
      return res.status(400).json({ success: false, message: 'All order details are required.' });
    }

    const cleanedPhone = phoneNumber.replace(/\D/g, '');
    if (cleanedPhone.length !== 10) {
      return res.status(400).json({ success: false, message: 'Mobile number must be exactly 10 digits.' });
    }

    // 1. Fetch Restaurant configurations
    const restaurant = await Restaurant.findById(restaurantId);
    if (!restaurant) {
      return res.status(404).json({ success: false, message: 'Restaurant not found.' });
    }

    // 2. Validate Geolocation distance if restaurant location is configured
    if (restaurant.location && restaurant.location.latitude && restaurant.location.longitude) {
      if (latitude === undefined || longitude === undefined) {
        return res.status(400).json({
          success: false,
          message: 'Location verification is required to place an order at this cafe. Please enable your GPS.',
        });
      }

      const distance = getDistanceInMeters(
        restaurant.location.latitude,
        restaurant.location.longitude,
        Number(latitude),
        Number(longitude)
      );

      // Maximum allowed distance: 100 meters
      const MAX_DISTANCE_METERS = 100;
      if (distance > MAX_DISTANCE_METERS) {
        console.log(`[Geofence Block] User is ${Math.round(distance)}m away from ${restaurant.name} (Max: ${MAX_DISTANCE_METERS}m)`);
        return res.status(400).json({
          success: false,
          message: `You must be physically present at the restaurant to place an order. (Detected: ${Math.round(distance)} meters away)`,
        });
      }
      console.log(`[Geofence Pass] User is ${Math.round(distance)}m away from ${restaurant.name} (Allowed)`);
    }

    // 3. Compute costs securely from Database pricing to avoid client-side tampering
    let subtotal = 0;
    const validatedItems = [];

    for (const item of items) {
      const dish = await Dish.findById(item.dishId);
      if (!dish) {
        return res.status(404).json({ success: false, message: `Dish item ${item.name} not found.` });
      }

      if (!dish.available) {
        return res.status(400).json({ success: false, message: `Dish "${dish.name}" is currently out of stock.` });
      }

      // Base price
      let itemPrice = dish.price;
      const itemCustomizations = [];

      // Calculate customization extra costs
      if (item.customizations && item.customizations.length > 0) {
        for (const selectedCust of item.customizations) {
          // Check if customization group exists in DB
          const dbCustGroup = dish.customizations.find(g => g.name === selectedCust.name);
          if (dbCustGroup) {
            const dbOption = dbCustGroup.options.find(o => o.name === selectedCust.selectedOption);
            if (dbOption) {
              itemCustomizations.push({
                name: selectedCust.name,
                selectedOption: selectedCust.selectedOption,
                extraPrice: dbOption.extraPrice,
              });
              itemPrice += dbOption.extraPrice;
            }
          }
        }
      }

      const itemTotal = itemPrice * item.quantity;
      subtotal += itemTotal;

      validatedItems.push({
        dishId: dish._id,
        name: dish.name,
        price: dish.price, // Store base price
        quantity: item.quantity,
        customizations: itemCustomizations,
        specialInstructions: item.specialInstructions || '',
      });
    }

    // Calculate tax using restaurant tax rate
    const taxRate = restaurant.taxRate || 5;
    const tax = Number(((subtotal * taxRate) / 100).toFixed(2));
    const totalAmount = Number((subtotal + tax).toFixed(2));

    // 4. Save order to database
    const order = new Order({
      restaurantId,
      customerName,
      phoneNumber: cleanedPhone,
      tableNumber,
      items: validatedItems,
      status: 'received',
      subtotal,
      tax,
      totalAmount,
    });
    await order.save();

    // 5. Consume/delete OTP token to prevent reuse
    await Otp.deleteOne({ phoneNumber: cleanedPhone });

    // 6. Broadcast via Socket.io
    const io = req.app.get('io');
    if (io) {
      // Notify restaurant room
      io.to(restaurantId.toString()).emit('new_order', order);
      console.log(`[Socket] Dispatched new_order event to restaurant room: ${restaurantId}`);
    }

    return res.status(201).json({
      success: true,
      message: 'Order placed successfully.',
      data: order,
    });
  } catch (error: any) {
    console.error('Order placement error:', error);
    return res.status(500).json({ success: false, message: 'Failed to place order.', error: error.message });
  }
});

/**
 * @route   POST /api/orders/manual
 * @desc    Place a manual POS order by staff/admin for a dining table
 * @access  Private (Restaurant Admin / Staff / Super Admin)
 */
router.post('/manual', protect, restrictTo('restaurant_admin', 'staff', 'super_admin'), async (req: AuthRequest, res: Response) => {
  try {
    let restaurantId = req.user?.restaurantId || req.body.restaurantId;
    if (!restaurantId) {
      const firstRest = await Restaurant.findOne();
      restaurantId = firstRest ? firstRest._id : null;
    }

    if (!restaurantId) {
      return res.status(400).json({ success: false, message: 'Restaurant identifier is required.' });
    }

    const { tableNumber, customerName, phoneNumber, items, specialInstructions } = req.body;

    if (!tableNumber || !items || !items.length) {
      return res.status(400).json({ success: false, message: 'Table number and at least one item are required.' });
    }

    const restaurant = await Restaurant.findById(restaurantId);
    if (!restaurant) {
      return res.status(404).json({ success: false, message: 'Restaurant not found.' });
    }

    // Default guest info if not provided
    const guestName = (customerName && customerName.trim()) ? customerName.trim() : 'Walk-in Guest';
    let cleanedPhone = phoneNumber ? phoneNumber.replace(/\D/g, '') : '';
    if (cleanedPhone.length !== 10) {
      cleanedPhone = '9999999999';
    }

    // Compute costs securely from Database pricing
    let subtotal = 0;
    const validatedItems = [];

    for (const item of items) {
      const dish = await Dish.findById(item.dishId);
      if (!dish) {
        return res.status(404).json({ success: false, message: `Dish item "${item.name || item.dishId}" not found.` });
      }

      if (!dish.available) {
        return res.status(400).json({ success: false, message: `Dish "${dish.name}" is currently marked out of stock.` });
      }

      let itemPrice = dish.price;
      const itemCustomizations = [];

      if (item.customizations && item.customizations.length > 0) {
        for (const selectedCust of item.customizations) {
          const dbCustGroup = dish.customizations.find(g => g.name === selectedCust.name);
          if (dbCustGroup) {
            const dbOption = dbCustGroup.options.find(o => o.name === selectedCust.selectedOption);
            if (dbOption) {
              itemCustomizations.push({
                name: selectedCust.name,
                selectedOption: selectedCust.selectedOption,
                extraPrice: dbOption.extraPrice,
              });
              itemPrice += dbOption.extraPrice;
            }
          }
        }
      }

      const itemTotal = itemPrice * item.quantity;
      subtotal += itemTotal;

      validatedItems.push({
        dishId: dish._id,
        name: dish.name,
        price: dish.price,
        quantity: item.quantity,
        customizations: itemCustomizations,
        specialInstructions: item.specialInstructions || specialInstructions || '',
      });
    }

    const taxRate = restaurant.taxRate || 5;
    const tax = Number(((subtotal * taxRate) / 100).toFixed(2));
    const totalAmount = Number((subtotal + tax).toFixed(2));

    const order = new Order({
      restaurantId,
      customerName: guestName,
      phoneNumber: cleanedPhone,
      tableNumber: String(tableNumber),
      items: validatedItems,
      status: 'received',
      subtotal,
      tax,
      totalAmount,
    });
    await order.save();

    // Broadcast real-time Socket.IO notification to restaurant room
    const io = req.app.get('io');
    if (io) {
      io.to(restaurantId.toString()).emit('new_order', order);
      io.to(restaurantId.toString()).emit('table_status_updated', { tableNumber: String(tableNumber) });
      console.log(`[Socket] Dispatched new manual order event to restaurant room: ${restaurantId}`);
    }

    return res.status(201).json({
      success: true,
      message: 'Manual table order created successfully.',
      data: order,
    });
  } catch (error: any) {
    console.error('Manual order placement error:', error);
    return res.status(500).json({ success: false, message: 'Failed to place manual order.', error: error.message });
  }
});


/**
 * @route   GET /api/orders or GET /api/orders/my-restaurant
 * @desc    Fetch active and historical orders of restaurant tenant
 * @access  Private (Restaurant Admin / Staff)
 */
const getRestaurantOrdersHandler = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user || !req.user.restaurantId) {
      return res.status(400).json({ success: false, message: 'User is not associated with any restaurant.' });
    }

    // Query active non-completed, non-cancelled orders for operational dashboards
    const orders = await Order.find({
      restaurantId: req.user.restaurantId,
      status: { $nin: ['completed', 'cancelled'] },
    }).sort({ createdAt: -1 }).lean();

    return res.json({ success: true, count: orders.length, data: orders });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: 'Failed to retrieve orders.', error: error.message });
  }
};

router.get('/', protect, restrictTo('restaurant_admin', 'staff'), getRestaurantOrdersHandler);
router.get('/my-restaurant', protect, restrictTo('restaurant_admin', 'staff'), getRestaurantOrdersHandler);

/**
 * @route   GET /api/orders/:id
 * @desc    Get order details (for tracking screen)
 * @access  Public
 */
router.get('/:id', async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found.' });
    }
    return res.json({ success: true, data: order });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: 'Failed to fetch order status.', error: error.message });
  }
});

/**
 * @route   PATCH /api/orders/:id/status
 * @desc    Update order workflow status (received -> accepted -> preparing -> ready -> served -> completed -> cancelled)
 * @access  Private (Restaurant Admin / Staff)
 */
router.patch('/:id/status', protect, restrictTo('restaurant_admin', 'staff'), async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user || !req.user.restaurantId) {
      return res.status(400).json({ success: false, message: 'User is not associated with any restaurant.' });
    }

    const { status, paymentMethod = 'cash' } = req.body;
    const validStatuses = ['received', 'accepted', 'preparing', 'ready', 'served', 'completed', 'cancelled'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid order status value.' });
    }

    const order = await Order.findOne({ _id: req.params.id, restaurantId: req.user.restaurantId });
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found in your restaurant.' });
    }

    order.status = status;
    await order.save();

    // Broadcast update via WebSockets
    const io = req.app.get('io');
    if (io) {
      // Notify tracking customer room
      io.to(order._id.toString()).emit('order_status_updated', order);
      // Notify restaurant room
      io.to(req.user.restaurantId.toString()).emit('order_updated', order);
      console.log(`[Socket] Broadcast order_status_updated to: ${order._id}`);
    }

    // Automatically trigger Invoice Bill generation on completion
    let populatedBillData = null;
    if (status === 'completed') {
      let billObj = await Bill.findOne({ orderId: order._id });
      if (!billObj) {
        const restaurant = await Restaurant.findById(req.user.restaurantId);
        if (restaurant) {
          const billNo = generateBillNumber();
          const pdfFilePath = await generateBillPDF(restaurant, order, billNo);

          const bill = new Bill({
            billNumber: billNo,
            restaurantId: req.user.restaurantId,
            orderId: order._id,
            subtotal: order.subtotal,
            tax: order.tax,
            totalAmount: order.totalAmount,
            pdfUrl: pdfFilePath,
            paymentStatus: 'paid',
            paymentMethod: paymentMethod || 'cash',
          });
          await bill.save();
          billObj = bill;
          console.log(`[Billing] Bill invoice generated: ${billNo}`);

          if (io) {
            const populatedBill = await Bill.findById(bill._id)
              .populate('orderId')
              .populate('restaurantId', 'name address contact gstNumber paymentSettings');
            io.to(order._id.toString()).emit('bill_ready', populatedBill);
          }
        }
      } else {
        // If bill exists (e.g., from customer payment request), mark it as paid
        billObj.paymentStatus = 'paid';
        if (!billObj.paymentMethod && paymentMethod) {
          billObj.paymentMethod = paymentMethod as any;
        }
        await billObj.save();
      }

      if (billObj) {
        populatedBillData = await Bill.findById(billObj._id)
          .populate('orderId')
          .populate('restaurantId', 'name address contact gstNumber paymentSettings');
      }

      // Automatically resolve any pending request_bill requests for this table
      await WaiterRequest.updateMany(
        { restaurantId: req.user.restaurantId, tableNumber: order.tableNumber, type: 'request_bill', status: 'pending' },
        { status: 'resolved' }
      );

      if (io) {
        io.to(req.user.restaurantId.toString()).emit('table_status_updated', { tableNumber: order.tableNumber });
      }
    }

    return res.json({ success: true, message: `Order status set to ${status}.`, data: order, bill: populatedBillData });
  } catch (error: any) {
    console.error('Update status error:', error);
    return res.status(500).json({ success: false, message: 'Failed to update status.', error: error.message });
  }
});

/**
 * @route   POST /api/orders/waiter-request
 * @desc    Submit a table service request (Public - called by customer table menu)
 * @access  Public
 */
router.post('/waiter-request', async (req, res) => {
  try {
    const { restaurantId, tableNumber, type } = req.body;

    if (!restaurantId || !tableNumber || !type) {
      return res.status(400).json({ success: false, message: 'All fields (restaurantId, tableNumber, type) are required.' });
    }

    const validTypes = ['call_waiter', 'request_water', 'request_bill', 'other'];
    if (!validTypes.includes(type)) {
      return res.status(400).json({ success: false, message: 'Invalid service request type.' });
    }

    // Save request to DB
    const request = new WaiterRequest({
      restaurantId,
      tableNumber,
      type,
      status: 'pending',
    });
    await request.save();

    // Broadcast to restaurant socket room
    const io = req.app.get('io');
    if (io) {
      io.to(restaurantId.toString()).emit('waiter_requested', request);
      if (type === 'request_bill') {
        // Also update the active order document
        await Order.updateMany(
          { restaurantId, tableNumber, status: { $nin: ['completed', 'cancelled'] } },
          { $set: { billRequested: true } }
        );
        io.to(restaurantId.toString()).emit('bill_requested', { restaurantId, tableNumber });
        io.to(restaurantId.toString()).emit('table_status_updated', { tableNumber });
      }
      console.log(`[Socket] Dispatched waiter_requested event to restaurant room: ${restaurantId}`);
    }

    return res.status(201).json({
      success: true,
      message: 'Service request submitted successfully.',
      data: request,
    });
  } catch (error: any) {
    console.error('Waiter request submission error:', error);
    return res.status(500).json({ success: false, message: 'Failed to submit service request.', error: error.message });
  }
});

/**
 * @route   GET /api/orders/waiter-requests/active
 * @desc    Get all active pending waiter requests for this restaurant
 * @access  Private (Restaurant Admin / Staff)
 */
router.get('/waiter-requests/active', protect, restrictTo('restaurant_admin', 'staff'), async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user || !req.user.restaurantId) {
      return res.status(400).json({ success: false, message: 'User is not associated with any restaurant.' });
    }

    const requests = await WaiterRequest.find({
      restaurantId: req.user.restaurantId,
      status: 'pending',
    }).sort({ createdAt: -1 }).lean();

    return res.json({ success: true, count: requests.length, data: requests });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: 'Failed to retrieve active waiter requests.', error: error.message });
  }
});

/**
 * @route   PATCH /api/orders/waiter-requests/:id/resolve
 * @desc    Mark a waiter request as resolved
 * @access  Private (Restaurant Admin / Staff)
 */
router.patch('/waiter-requests/:id/resolve', protect, restrictTo('restaurant_admin', 'staff'), async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user || !req.user.restaurantId) {
      return res.status(400).json({ success: false, message: 'User is not associated with any restaurant.' });
    }

    const request = await WaiterRequest.findOne({
      _id: req.params.id,
      restaurantId: req.user.restaurantId,
    });

    if (!request) {
      return res.status(404).json({ success: false, message: 'Service request not found.' });
    }

    request.status = 'resolved';
    await request.save();

    // Broadcast to restaurant socket room
    const io = req.app.get('io');
    if (io) {
      io.to(req.user.restaurantId.toString()).emit('waiter_request_resolved', { _id: request._id });
      console.log(`[Socket] Dispatched waiter_request_resolved event for: ${request._id}`);
    }

    return res.json({
      success: true,
      message: 'Service request marked as resolved.',
      data: request,
    });
  } catch (error: any) {
    console.error('Resolve waiter request error:', error);
    return res.status(500).json({ success: false, message: 'Failed to resolve service request.', error: error.message });
  }
});

/**
 * @route   POST /api/orders/:id/append
 * @desc    Append items to an active order (Customer ordering more items)
 * @access  Public
 */
router.post('/:id/append', async (req, res) => {
  try {
    const { items } = req.body;

    if (!items || !items.length) {
      return res.status(400).json({ success: false, message: 'Items list is required.' });
    }

    const order = await Order.findById(req.params.id);
    if (!order) {
      return res.status(404).json({ success: false, message: 'Active order not found.' });
    }

    if (order.status === 'completed' || order.status === 'cancelled') {
      return res.status(400).json({ success: false, message: 'This order has already been finalized.' });
    }

    const restaurant = await Restaurant.findById(order.restaurantId);
    if (!restaurant) {
      return res.status(404).json({ success: false, message: 'Associated restaurant not found.' });
    }

    // Secure price validation from DB
    let newSubtotal = 0;
    const validatedNewItems = [];

    for (const item of items) {
      const dish = await Dish.findById(item.dishId);
      if (!dish) {
        return res.status(404).json({ success: false, message: `Dish item ${item.name} not found.` });
      }

      if (!dish.available) {
        return res.status(400).json({ success: false, message: `Dish "${dish.name}" is currently out of stock.` });
      }

      let itemPrice = dish.price;
      const itemCustomizations = [];

      if (item.customizations && item.customizations.length > 0) {
        for (const selectedCust of item.customizations) {
          const dbCustGroup = dish.customizations.find(g => g.name === selectedCust.name);
          if (dbCustGroup) {
            const dbOption = dbCustGroup.options.find(o => o.name === selectedCust.selectedOption);
            if (dbOption) {
              itemCustomizations.push({
                name: selectedCust.name,
                selectedOption: selectedCust.selectedOption,
                extraPrice: dbOption.extraPrice,
              });
              itemPrice += dbOption.extraPrice;
            }
          }
        }
      }

      const itemTotal = itemPrice * item.quantity;
      newSubtotal += itemTotal;

      validatedNewItems.push({
        dishId: dish._id,
        name: dish.name,
        price: dish.price,
        quantity: item.quantity,
        customizations: itemCustomizations,
        specialInstructions: item.specialInstructions || '',
      });
    }

    // Append to existing order items list
    order.items.push(...(validatedNewItems as any));

    // Recalculate values
    order.subtotal = Number((order.subtotal + newSubtotal).toFixed(2));
    const taxRate = restaurant.taxRate || 5;
    order.tax = Number(((order.subtotal * taxRate) / 100).toFixed(2));
    order.totalAmount = Number((order.subtotal + order.tax).toFixed(2));

    // If order was already served or ready, move back to accepted to notify kitchen
    if (order.status === 'served' || order.status === 'ready') {
      order.status = 'accepted';
    }

    await order.save();

    // Broadcast updates via WebSockets
    const io = req.app.get('io');
    if (io) {
      // Notify tracking customer room
      io.to(order._id.toString()).emit('order_status_updated', order);
      // Notify restaurant room
      io.to(order.restaurantId.toString()).emit('order_updated', order);
      // Emit special event for highlighting new items
      io.to(order.restaurantId.toString()).emit('order_items_appended', {
        orderId: order._id,
        tableNumber: order.tableNumber,
        newItems: validatedNewItems,
      });
    }

    return res.json({
      success: true,
      message: 'Items added to order successfully.',
      data: order,
    });
  } catch (error: any) {
    console.error('Append order error:', error);
    return res.status(500).json({ success: false, message: 'Failed to add items to order.', error: error.message });
  }
});

export default router;
