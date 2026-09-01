import mongoose from 'mongoose';
import express from 'express';
import dotenv from 'dotenv';
import Order from '../models/Order';
import TableSession from '../models/TableSession';
import orderRoutes from '../routes/order';

dotenv.config();

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/cafeflow';

async function runActiveTableSecurityTests() {
  console.log('\n===============================================================');
  console.log('RUNNING SECURITY & PII SANITIZATION TEST FOR GET /api/orders/active-table');
  console.log('===============================================================\n');

  try {
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(MONGO_URI);
    }

    const testRestaurantId = new mongoose.Types.ObjectId();
    const tableNum = 'T-SEC-300';

    // 1. Create a dummy Order & TableSession with rich PII data
    const secretCustomerName = 'Sensitive Customer Name John Doe';
    const secretPhone = '9876543210';

    const order = new Order({
      restaurantId: testRestaurantId,
      customerName: secretCustomerName,
      phoneNumber: secretPhone,
      tableNumber: tableNum,
      items: [
        {
          dishId: new mongoose.Types.ObjectId(),
          name: 'Secret Pasta',
          price: 150,
          quantity: 1,
        },
      ],
      status: 'accepted',
      subtotal: 150,
      tax: 7.5,
      totalAmount: 157.5,
    });
    await order.save();

    const session = new TableSession({
      restaurantId: testRestaurantId,
      tableNumber: tableNum,
      status: 'active',
      customerName: secretCustomerName,
      phoneNumber: secretPhone,
      guestNames: [secretCustomerName, 'Guest Bob', 'Guest Alice'],
      guestPhones: [secretPhone, '9123456789'],
      orderId: order._id,
    });
    await session.save();

    // 2. Set up lightweight Express app to test route handler
    const app = express();
    app.use(express.json());
    app.use('/api/orders', orderRoutes);

    // Mock response objects to test route directly
    const reqMock: any = {
      query: {
        restaurantId: testRestaurantId.toString(),
        tableNumber: tableNum,
      },
    };

    let responseData: any = null;
    const resMock: any = {
      status: (code: number) => {
        resMock.statusCode = code;
        return resMock;
      },
      json: (data: any) => {
        responseData = data;
        return resMock;
      },
    };

    // 3. Directly invoke endpoint handler logic
    console.log('[Security Test] Querying active-table for Table T-SEC-300...');
    const handleRoute = (orderRoutes.stack as any[]).find(
      (layer) => layer.route && layer.route.path === '/active-table' && layer.route.methods.get
    ).route.stack[0].handle;

    await handleRoute(reqMock, resMock);

    console.log('[Security Test] Analyzing response payload for PII leakage...');

    if (!responseData || !responseData.success || !responseData.data) {
      throw new Error('Security Test Failed: Route did not return data object');
    }

    const payload = responseData.data;

    // Assert PII fields are strictly undefined
    const piiKeys = ['customerName', 'phoneNumber', 'guestNames', 'guestPhones', 'phone'];
    const leakedKeys: string[] = [];

    for (const key of piiKeys) {
      if (payload[key] !== undefined) {
        leakedKeys.push(key);
      }
    }

    // Inspect raw JSON string representation to guarantee no PII anywhere in JSON output
    const jsonStr = JSON.stringify(responseData);
    if (jsonStr.includes(secretCustomerName)) {
      throw new Error(`CRITICAL SECURITY FAILURE: Customer Name "${secretCustomerName}" leaked in response JSON!`);
    }
    if (jsonStr.includes(secretPhone)) {
      throw new Error(`CRITICAL SECURITY FAILURE: Phone Number "${secretPhone}" leaked in response JSON!`);
    }
    if (jsonStr.includes('Guest Alice') || jsonStr.includes('Guest Bob')) {
      throw new Error('CRITICAL SECURITY FAILURE: Guest names leaked in response JSON!');
    }

    if (leakedKeys.length > 0) {
      throw new Error(`CRITICAL SECURITY FAILURE: Leaked keys: ${leakedKeys.join(', ')}`);
    }

    console.log('  └─► PASS: customerName, phoneNumber, guestNames, guestPhones are 100% EXCLUDED from response!');
    console.log('  └─► PASS: Response contains only safe UI fields:', Object.keys(payload).join(', '));

    // Cleanup
    await Order.deleteMany({ restaurantId: testRestaurantId });
    await TableSession.deleteMany({ restaurantId: testRestaurantId });

    console.log('\n===============================================================');
    console.log('SECURITY & PII SANITIZATION TEST PASSED 100%');
    console.log('===============================================================\n');
  } catch (err: any) {
    console.error('\n❌ SECURITY TEST FAILURE:', err.message);
    process.exit(1);
  }
}

if (require.main === module) {
  runActiveTableSecurityTests().then(() => process.exit(0));
}
