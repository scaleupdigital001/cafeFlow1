import mongoose from 'mongoose';
import dotenv from 'dotenv';
import TableSession from '../models/TableSession';
import Order from '../models/Order';
import { getOrCreateActiveTableSession } from '../utils/sessionManager';

dotenv.config();

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/cafeflow';

async function runSessionManagerTests() {
  console.log('\n===============================================================');
  console.log('RUNNING INTEGRATION TESTS FOR getOrCreateActiveTableSession');
  console.log('===============================================================\n');

  try {
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(MONGO_URI);
    }

    const testRestaurantId = new mongoose.Types.ObjectId();
    const tableNum = 'T-101';

    // Cleanup any existing test data for this table
    await TableSession.deleteMany({ restaurantId: testRestaurantId, tableNumber: tableNum });
    await Order.deleteMany({ restaurantId: testRestaurantId, tableNumber: tableNum });

    // TEST (a): First order creates session & order
    console.log('[Test A] First order creates session and order...');
    const resA = await getOrCreateActiveTableSession(testRestaurantId, tableNum, 'Alice', '9876543210');
    
    if (!resA.isNew) throw new Error('Test A Failed: Expected isNew to be true for first order');
    if (resA.session.status !== 'active') throw new Error('Test A Failed: Session status should be active');
    if (resA.session.customerName !== 'Alice') throw new Error('Test A Failed: Customer name should be Alice');
    if (!resA.session.guestNames.includes('Alice')) throw new Error('Test A Failed: guestNames should include Alice');
    console.log('  └─► PASS: Session created with ID:', resA.session._id);

    // TEST (b): Second order on same table attaches to existing session
    console.log('[Test B] Second order on same table attaches to existing session...');
    const resB = await getOrCreateActiveTableSession(testRestaurantId, tableNum, 'Bob', '9123456789');

    if (resB.isNew) throw new Error('Test B Failed: Expected isNew to be false for second order');
    if (resB.session._id.toString() !== resA.session._id.toString()) {
      throw new Error('Test B Failed: Session ID changed! Expected same session');
    }
    
    // Fetch refreshed session to verify atomic $addToSet guest names
    const refreshedSession = await TableSession.findById(resA.session._id);
    if (!refreshedSession?.guestNames.includes('Bob')) {
      throw new Error('Test B Failed: guestNames array does not include Bob after second order');
    }
    console.log('  └─► PASS: Attached to existing session. Guests:', refreshedSession.guestNames);

    // TEST (c): Concurrent requests for the same new table (Promise.all 5 simultaneous)
    console.log('[Test C] Simulating 5 simultaneous concurrent requests for new Table T-102...');
    const concurrentTableNum = 'T-102';
    await TableSession.deleteMany({ restaurantId: testRestaurantId, tableNumber: concurrentTableNum });
    await Order.deleteMany({ restaurantId: testRestaurantId, tableNumber: concurrentTableNum });

    const promises = [1, 2, 3, 4, 5].map((idx) =>
      getOrCreateActiveTableSession(testRestaurantId, concurrentTableNum, `Guest_${idx}`, `900000000${idx}`)
    );

    const results = await Promise.all(promises);
    const createdSessions = await TableSession.find({ restaurantId: testRestaurantId, tableNumber: concurrentTableNum, status: 'active' });

    if (createdSessions.length !== 1) {
      throw new Error(`Test C Failed: Concurrent requests created ${createdSessions.length} active sessions instead of 1!`);
    }

    const uniqueOrderIds = new Set(results.map((r) => r.order._id.toString()));
    if (uniqueOrderIds.size !== 1) {
      throw new Error(`Test C Failed: Concurrent requests returned ${uniqueOrderIds.size} different order IDs instead of 1!`);
    }
    console.log('  └─► PASS: Exactly 1 active session created despite 5 parallel requests!');

    // TEST (d): A request for a table whose session's order was completed/cancelled starts a fresh session
    console.log('[Test D] Completed order starts a fresh new session...');
    const resC = results[0];
    resC.order.status = 'completed';
    await resC.order.save();

    await TableSession.updateOne({ _id: resC.session._id }, { $set: { status: 'closed' } });

    const resD = await getOrCreateActiveTableSession(testRestaurantId, concurrentTableNum, 'Charlie', '9988776655');
    if (!resD.isNew) throw new Error('Test D Failed: Expected new session after closing prior session');
    if (resD.session._id.toString() === resC.session._id.toString()) {
      throw new Error('Test D Failed: Expected a new session ID for fresh session');
    }
    console.log('  └─► PASS: Fresh session created after closing previous session. New Session ID:', resD.session._id);

    // Clean up test data
    await TableSession.deleteMany({ restaurantId: testRestaurantId });
    await Order.deleteMany({ restaurantId: testRestaurantId });

    console.log('\n===============================================================');
    console.log('ALL SESSION MANAGER INTEGRATION TESTS PASSED 100%');
    console.log('===============================================================\n');
  } catch (err: any) {
    console.error('\n❌ SESSION MANAGER TEST FAILURE:', err.message);
    process.exit(1);
  }
}

if (require.main === module) {
  runSessionManagerTests().then(() => process.exit(0));
}
