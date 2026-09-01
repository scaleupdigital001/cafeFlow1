import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Order from '../models/Order';
import Bill from '../models/Bill';
import Restaurant from '../models/Restaurant';
import TableSession from '../models/TableSession';
import { runTableSessionMigration } from '../scripts/migrate-table-sessions';

dotenv.config();

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/cafeflow';

async function runMigrationTests() {
  console.log('\n===============================================================');
  console.log('RUNNING INTEGRATION TEST FOR MIGRATION SCRIPT');
  console.log('===============================================================\n');

  try {
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(MONGO_URI);
    }

    const testDishId = new mongoose.Types.ObjectId();

    // 1. Create Test Restaurant with explicit 8% taxRate
    const restaurant = new Restaurant({
      name: 'Migration Test Bistro',
      slug: `migration-test-${Date.now()}`,
      address: '123 Test St',
      contact: '9999999999',
      taxRate: 8, // 8% tax rate
    });
    await restaurant.save();

    const tableNum = 'T-MIGRATE-200';

    // 2. Create Order 1 (Older order)
    const order1 = new Order({
      restaurantId: restaurant._id,
      customerName: 'Guest 1',
      phoneNumber: '1111111111',
      tableNumber: tableNum,
      items: [
        {
          dishId: testDishId,
          name: 'Burger',
          price: 100,
          quantity: 1,
        },
      ],
      status: 'received',
      subtotal: 100,
      tax: 8,
      totalAmount: 108,
      createdAt: new Date(Date.now() - 60000), // 1 min ago
    });
    await order1.save();

    // Create Orphan Bill for Order 1
    const orphanBill = new Bill({
      billNumber: `BILL-MIG-1-${Date.now()}`,
      restaurantId: restaurant._id,
      orderId: order1._id,
      subtotal: 100,
      tax: 8,
      totalAmount: 108,
      paymentStatus: 'pending',
    });
    await orphanBill.save();

    // 3. Create Order 2 (Newer target order)
    const order2 = new Order({
      restaurantId: restaurant._id,
      customerName: 'Guest 2',
      phoneNumber: '2222222222',
      tableNumber: tableNum,
      items: [
        {
          dishId: testDishId,
          name: 'Pizza',
          price: 200,
          quantity: 1,
        },
      ],
      status: 'received',
      subtotal: 200,
      tax: 16,
      totalAmount: 216,
      createdAt: new Date(), // Now
    });
    await order2.save();

    // 4. Run Migration Script
    console.log('[Migration Test] Executing runTableSessionMigration()...');
    await runTableSessionMigration();

    // 5. Assertions
    const updatedOrder1 = await Order.findById(order1._id);
    const updatedOrder2 = await Order.findById(order2._id);
    const updatedBill = await Bill.findById(orphanBill._id);
    const createdSession = await TableSession.findOne({ restaurantId: restaurant._id, tableNumber: tableNum, status: 'active' });

    console.log('\n[Migration Test] Asserting results...');

    // Assert Order 1 was cancelled with mergeNote
    if (updatedOrder1?.status !== 'cancelled') {
      throw new Error(`Migration Test Failed: Expected Order 1 status to be 'cancelled', got '${updatedOrder1?.status}'`);
    }
    if (!updatedOrder1?.mergeNote || !updatedOrder1.mergeNote.includes('AUTO-MIGRATED')) {
      throw new Error(`Migration Test Failed: Order 1 mergeNote missing or invalid: '${updatedOrder1?.mergeNote}'`);
    }
    console.log('  └─► PASS: Older Order 1 correctly cancelled with mergeNote:', updatedOrder1.mergeNote);

    // Assert Orphan Bill was voided with voidNote
    if (updatedBill?.paymentStatus !== 'void') {
      throw new Error(`Migration Test Failed: Expected Orphan Bill status to be 'void', got '${updatedBill?.paymentStatus}'`);
    }
    if (!updatedBill?.voidNote || !updatedBill.voidNote.includes('AUTO-MIGRATED')) {
      throw new Error(`Migration Test Failed: Orphan Bill voidNote missing: '${updatedBill?.voidNote}'`);
    }
    console.log('  └─► PASS: Orphan Bill correctly marked void with voidNote:', updatedBill.voidNote);

    // Assert Target Order 2 merged items and recalculated amounts using 8% tax
    if (updatedOrder2?.items.length !== 2) {
      throw new Error(`Migration Test Failed: Expected Target Order 2 to have 2 items, got ${updatedOrder2?.items.length}`);
    }
    if (updatedOrder2?.subtotal !== 300) {
      throw new Error(`Migration Test Failed: Expected Target Order 2 subtotal to be 300, got ${updatedOrder2?.subtotal}`);
    }
    if (updatedOrder2?.tax !== 24) { // 300 * 8% = 24
      throw new Error(`Migration Test Failed: Expected Target Order 2 tax to be 24 (8% of 300), got ${updatedOrder2?.tax}`);
    }
    if (updatedOrder2?.totalAmount !== 324) {
      throw new Error(`Migration Test Failed: Expected Target Order 2 total to be 324, got ${updatedOrder2?.totalAmount}`);
    }
    console.log('  └─► PASS: Target Order 2 subtotal (300), tax (24 @ 8%), and total (324) recalculated correctly!');

    // Assert TableSession created and attached
    if (!createdSession) {
      throw new Error('Migration Test Failed: TableSession was not created!');
    }
    if (createdSession.orderId.toString() !== order2._id.toString()) {
      throw new Error('Migration Test Failed: TableSession orderId does not point to Target Order 2!');
    }
    console.log('  └─► PASS: Active TableSession created pointing to consolidated Order 2!');

    // Cleanup
    await Order.deleteMany({ restaurantId: restaurant._id });
    await Bill.deleteMany({ restaurantId: restaurant._id });
    await TableSession.deleteMany({ restaurantId: restaurant._id });
    await Restaurant.findByIdAndDelete(restaurant._id);

    console.log('\n===============================================================');
    console.log('MIGRATION SCRIPT INTEGRATION TEST PASSED 100%');
    console.log('===============================================================\n');
  } catch (err: any) {
    console.error('\n❌ MIGRATION TEST FAILURE:', err.message);
    process.exit(1);
  }
}

if (require.main === module) {
  runMigrationTests().then(() => process.exit(0));
}
