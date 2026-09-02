import mongoose from 'mongoose';
import dotenv from 'dotenv';
import QT, { IQT } from '../models/QT';
import Order from '../models/Order';
import Restaurant from '../models/Restaurant';

dotenv.config();

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/cafeflow';

async function runQTModelTests() {
  console.log('\n===============================================================');
  console.log('RUNNING UNIT TESTS FOR QT (QUICK TICKET / KOT) DATA MODEL');
  console.log('===============================================================\n');

  try {
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(MONGO_URI);
    }

    const testTenantId = new mongoose.Types.ObjectId();
    const testTenantId2 = new mongoose.Types.ObjectId();

    // Clean up test data
    await QT.deleteMany({ tenantId: { $in: [testTenantId, testTenantId2] } });

    // ------------------------------------------------------------------------
    // TEST 1: Creation & Required Fields Validation
    // ------------------------------------------------------------------------
    console.log('[Test 1] Creating a valid QT document...');
    const testOrderId1 = new mongoose.Types.ObjectId();

    const ticketNumber1 = await QT.generateNextTicketNumber(testTenantId);
    const qt1 = new QT({
      tenantId: testTenantId,
      tableNumber: 'Table-01',
      orderId: testOrderId1,
      items: [
        { name: 'Masala Dosa', quantity: 2, notes: 'Extra Sambhar' },
        { name: 'Cold Coffee', quantity: 1, notes: 'Less Sugar' },
      ],
      status: 'pending',
      ticketNumber: ticketNumber1,
    });

    const savedQt1 = await qt1.save();
    if (!savedQt1._id || savedQt1.status !== 'pending' || savedQt1.items.length !== 2) {
      throw new Error('Test 1 Failed: QT document was not created correctly.');
    }
    if (!savedQt1.ticketNumber.startsWith('QT-')) {
      throw new Error(`Test 1 Failed: Invalid ticket format: ${savedQt1.ticketNumber}`);
    }
    console.log(`  └─► PASS: Created QT with Ticket Number: ${savedQt1.ticketNumber}`);

    // ------------------------------------------------------------------------
    // TEST 2: Validation Enforcement (Missing required fields)
    // ------------------------------------------------------------------------
    console.log('[Test 2] Testing schema validation rules for missing fields...');
    try {
      const invalidQt = new QT({
        tableNumber: 'Table-01',
        // missing tenantId & orderId
        items: [],
      });
      await invalidQt.save();
      throw new Error('Test 2 Failed: Schema allowed creating QT with missing required fields!');
    } catch (err: any) {
      if (err.message.includes('Test 2 Failed')) throw err;
      console.log('  └─► PASS: Correctly rejected invalid QT missing tenantId, orderId & items!');
    }

    // ------------------------------------------------------------------------
    // TEST 3: Status Enum Validation
    // ------------------------------------------------------------------------
    console.log('[Test 3] Testing status enum constraint ("pending" | "printed" | "served")...');
    try {
      const invalidStatusQt = new QT({
        tenantId: testTenantId,
        tableNumber: 'Table-01',
        orderId: testOrderId1,
        items: [{ name: 'Tea', quantity: 1 }],
        status: 'invalid_status' as any,
        ticketNumber: 'QT-TEST-0001',
      });
      await invalidStatusQt.save();
      throw new Error('Test 3 Failed: Schema allowed invalid status value!');
    } catch (err: any) {
      if (err.message.includes('Test 3 Failed')) throw err;
      console.log('  └─► PASS: Correctly rejected invalid status "invalid_status"!');
    }

    // ------------------------------------------------------------------------
    // TEST 4: Human-Readable Ticket Number Sequence Per Tenant Per Day
    // ------------------------------------------------------------------------
    console.log('[Test 4] Testing sequential ticket number generation per tenant per day...');
    const testOrderId2 = new mongoose.Types.ObjectId();
    const qt2 = await QT.createForOrder({
      tenantId: testTenantId,
      tableNumber: 'Table-01',
      _id: testOrderId2,
      items: [{ name: 'Paneer Butter Masala', quantity: 1, specialInstructions: 'Spicy' }],
    });

    const testOrderId3 = new mongoose.Types.ObjectId();
    const qt3 = await QT.createForOrder({
      tenantId: testTenantId,
      tableNumber: 'Table-02',
      _id: testOrderId3,
      items: [{ name: 'Butter Naan', quantity: 4 }],
    });

    // Check sequence format
    const seq1 = parseInt(savedQt1.ticketNumber.split('-').pop() || '0', 10);
    const seq2 = parseInt(qt2.ticketNumber.split('-').pop() || '0', 10);
    const seq3 = parseInt(qt3.ticketNumber.split('-').pop() || '0', 10);

    if (seq2 !== seq1 + 1 || seq3 !== seq2 + 1) {
      throw new Error(`Test 4 Failed: Ticket sequence numbers not incrementing correctly: ${seq1}, ${seq2}, ${seq3}`);
    }

    // Verify multi-tenant sequence isolation (Tenant 2 starts at sequence 0001)
    const qtTenant2 = await QT.createForOrder({
      tenantId: testTenantId2,
      tableNumber: 'Table-01',
      _id: new mongoose.Types.ObjectId(),
      items: [{ name: 'Espresso', quantity: 1 }],
    });
    const tenant2Seq = parseInt(qtTenant2.ticketNumber.split('-').pop() || '0', 10);
    if (tenant2Seq !== 1) {
      throw new Error(`Test 4 Failed: Tenant sequence isolation failed. Expected 1 for new tenant, got ${tenant2Seq}`);
    }

    console.log(`  └─► PASS: Ticket sequences incremented (${seq1} -> ${seq2} -> ${seq3}) and tenant isolation verified!`);

    // ------------------------------------------------------------------------
    // TEST 5: Index Behavior Verification
    // ------------------------------------------------------------------------
    console.log('[Test 5] Verifying database indexes for fast query execution...');
    await QT.syncIndexes();
    const indexes = await QT.collection.indexes();

    const hasTenantTableCreatedIdx = indexes.some(
      (idx) => idx.key.tenantId === 1 && idx.key.tableNumber === 1 && idx.key.createdAt === -1
    );
    const hasTenantStatusCreatedIdx = indexes.some(
      (idx) => idx.key.tenantId === 1 && idx.key.status === 1 && idx.key.createdAt === -1
    );

    if (!hasTenantTableCreatedIdx) {
      throw new Error('Test 5 Failed: Index on { tenantId: 1, tableNumber: 1, createdAt: -1 } is missing!');
    }
    if (!hasTenantStatusCreatedIdx) {
      throw new Error('Test 5 Failed: Index on { tenantId: 1, status: 1, createdAt: -1 } is missing!');
    }

    console.log('  └─► PASS: Required indexes ({ tenantId, tableNumber, createdAt } & { tenantId, status, createdAt }) are present!');

    // ------------------------------------------------------------------------
    // TEST 6: MULTI-ORDER-PER-TABLE SCENARIO
    // "If the same table places a second order later, a second separate QT must be created linked to that same table"
    // ------------------------------------------------------------------------
    console.log('[Test 6] Multi-Order-Per-Table Scenario: Table T-10 places two separate orders over time...');

    const sameTableNumber = 'Table-T10';
    const orderSessionA_Id = new mongoose.Types.ObjectId();
    const orderSessionB_Id = new mongoose.Types.ObjectId();

    // Order 1 at Table-T10
    const qtOrder1 = await QT.createForOrder({
      tenantId: testTenantId,
      tableNumber: sameTableNumber,
      _id: orderSessionA_Id,
      items: [
        { name: 'Veg Biryani', quantity: 1, specialInstructions: 'Extra Raita' },
        { name: 'Fresh Lime Soda', quantity: 2 },
      ],
    });

    // Order 2 at Table-T10 (placed later for same table)
    const qtOrder2 = await QT.createForOrder({
      tenantId: testTenantId,
      tableNumber: sameTableNumber,
      _id: orderSessionB_Id,
      items: [
        { name: 'Gulab Jamun', quantity: 2 },
        { name: 'Masala Chai', quantity: 1 },
      ],
    });

    // Fetch all QTs for Table-T10
    const tableQts = await QT.find({ tenantId: testTenantId, tableNumber: sameTableNumber }).sort({ createdAt: 1 });

    if (tableQts.length !== 2) {
      throw new Error(`Test 6 Failed: Expected 2 separate QTs for Table-T10, found ${tableQts.length}`);
    }

    if (tableQts[0]._id.equals(tableQts[1]._id)) {
      throw new Error('Test 6 Failed: The two QTs have identical IDs!');
    }

    if (!tableQts[0].orderId.equals(orderSessionA_Id) || !tableQts[1].orderId.equals(orderSessionB_Id)) {
      throw new Error('Test 6 Failed: QTs are not correctly linked to their respective order IDs!');
    }

    console.log(`  └─► PASS: Table ${sameTableNumber} placed 2 separate orders. Result: 2 distinct QT documents created!`);
    console.log(`      • Order 1 QT: ${tableQts[0].ticketNumber} (Order ID: ${tableQts[0].orderId})`);
    console.log(`      • Order 2 QT: ${tableQts[1].ticketNumber} (Order ID: ${tableQts[1].orderId})`);

    // Clean up test data
    await QT.deleteMany({ tenantId: { $in: [testTenantId, testTenantId2] } });

    console.log('\n===============================================================');
    console.log('ALL QT MODEL UNIT TESTS PASSED 100%');
    console.log('===============================================================\n');
  } catch (err: any) {
    console.error('\n❌ QT MODEL TEST FAILURE:', err.message);
    process.exit(1);
  }
}

if (require.main === module) {
  runQTModelTests().then(() => process.exit(0));
}
