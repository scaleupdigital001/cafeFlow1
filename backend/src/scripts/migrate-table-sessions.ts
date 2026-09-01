import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Order from '../models/Order';
import Bill from '../models/Bill';
import Restaurant from '../models/Restaurant';
import TableSession from '../models/TableSession';

dotenv.config();

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/cafeflow';

export async function runTableSessionMigration() {
  console.log('\n===============================================================');
  console.log('STARTING ONE-TIME MIGRATION: CONSOLIDATE OPEN TABLE ORDERS & SESSIONS');
  console.log('===============================================================\n');

  try {
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(MONGO_URI);
      console.log('[Database] Connected for migration.');
    }

    // Cache restaurant tax rates in memory to avoid repeated DB lookups
    const restaurantCache: Record<string, number> = {};
    const getRestaurantTaxRate = async (restaurantId: mongoose.Types.ObjectId | string): Promise<number> => {
      const idStr = restaurantId.toString();
      if (restaurantCache[idStr] !== undefined) return restaurantCache[idStr];

      const rest = await Restaurant.findById(idStr).lean();
      const rate = (rest && rest.taxRate !== undefined && rest.taxRate !== null) ? Number(rest.taxRate) : 5;
      restaurantCache[idStr] = rate;
      return rate;
    };

    // 1. Fetch all active non-completed, non-cancelled orders grouped by (restaurantId, tableNumber)
    const activeOrders = await Order.find({
      status: { $nin: ['completed', 'cancelled'] },
    }).sort({ createdAt: 1 }); // Oldest first

    const grouped: Record<string, typeof activeOrders> = {};
    for (const order of activeOrders) {
      const key = `${order.restaurantId.toString()}_${String(order.tableNumber).trim()}`;
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(order);
    }

    let mergedTablesCount = 0;
    let cancelledOrdersCount = 0;
    let voidedBillsCount = 0;
    let sessionsCreatedCount = 0;

    for (const [key, orders] of Object.entries(grouped)) {
      const [restaurantIdStr, tableNumber] = key.split('_');

      if (orders.length > 1) {
        console.log(`[Migrate] Found ${orders.length} duplicate active orders for Table "${tableNumber}" (Tenant: ${restaurantIdStr}). Merging...`);

        // Target order to merge everything into is the most recent order (last element)
        const targetOrder = orders[orders.length - 1];
        const sourceOrders = orders.slice(0, orders.length - 1);

        const mergedItems = [...targetOrder.items];
        let addedSubtotal = 0;
        const guestNamesSet = new Set<string>();
        const guestPhonesSet = new Set<string>();

        if (targetOrder.customerName) guestNamesSet.add(targetOrder.customerName);
        if (targetOrder.phoneNumber) guestPhonesSet.add(targetOrder.phoneNumber);

        for (const oldOrder of sourceOrders) {
          console.log(`  └─► Merging items from old Order ${oldOrder._id} into primary Order ${targetOrder._id}`);
          mergedItems.push(...oldOrder.items);
          addedSubtotal += oldOrder.subtotal;

          if (oldOrder.customerName) guestNamesSet.add(oldOrder.customerName);
          if (oldOrder.phoneNumber) guestPhonesSet.add(oldOrder.phoneNumber);

          // Mark old duplicate order as cancelled with explicit mergeNote audit log
          oldOrder.status = 'cancelled';
          oldOrder.mergeNote = `[AUTO-MIGRATED]: Items merged into primary active Order ${targetOrder._id} on ${new Date().toISOString()}`;
          await oldOrder.save();
          cancelledOrdersCount++;

          // Point 3: Void any Bill documents associated with cancelled duplicate orders
          const orphanBill = await Bill.findOne({ orderId: oldOrder._id });
          if (orphanBill) {
            orphanBill.paymentStatus = 'void';
            orphanBill.voidNote = `[AUTO-MIGRATED]: Voided orphan bill for cancelled duplicate Order ${oldOrder._id}. Merged into primary Order ${targetOrder._id}`;
            await orphanBill.save();
            voidedBillsCount++;
            console.log(`  └─► Voided orphan Bill ${orphanBill.billNumber} (Order ${oldOrder._id})`);
          }
        }

        // Point 1: Calculate tax using actual restaurant's taxRate from DB
        const activeTaxRate = await getRestaurantTaxRate(targetOrder.restaurantId);
        targetOrder.items = mergedItems as any;
        targetOrder.subtotal = Number((targetOrder.subtotal + addedSubtotal).toFixed(2));
        targetOrder.tax = Number(((targetOrder.subtotal * activeTaxRate) / 100).toFixed(2));
        targetOrder.totalAmount = Number((targetOrder.subtotal + targetOrder.tax).toFixed(2));
        await targetOrder.save();

        mergedTablesCount++;

        // Point 7: Create active TableSession with full guestNames & guestPhones array
        let session = await TableSession.findOne({
          restaurantId: targetOrder.restaurantId,
          tableNumber,
          status: 'active',
        });

        if (!session) {
          session = new TableSession({
            restaurantId: targetOrder.restaurantId,
            tableNumber,
            status: 'active',
            customerName: targetOrder.customerName || `Table ${tableNumber} Guest`,
            phoneNumber: targetOrder.phoneNumber || '',
            guestNames: Array.from(guestNamesSet),
            guestPhones: Array.from(guestPhonesSet),
            orderId: targetOrder._id,
          });
          await session.save();
          sessionsCreatedCount++;
        } else if (session) {
          // Sync unique guest names
          guestNamesSet.forEach((n) => { if (session && !session.guestNames.includes(n)) session.guestNames.push(n); });
          guestPhonesSet.forEach((p) => { if (session && !session.guestPhones.includes(p)) session.guestPhones.push(p); });
          await session.save();
        }

        if (session) {
          targetOrder.sessionId = session._id as any;
          await targetOrder.save();
        }
      } else if (orders.length === 1) {
        // Table has exactly 1 open order — create TableSession if missing
        const singleOrder = orders[0];
        let session = await TableSession.findOne({
          restaurantId: singleOrder.restaurantId,
          tableNumber,
          status: 'active',
        });

        if (!session) {
          session = new TableSession({
            restaurantId: singleOrder.restaurantId,
            tableNumber,
            status: 'active',
            customerName: singleOrder.customerName || `Table ${tableNumber} Guest`,
            phoneNumber: singleOrder.phoneNumber || '',
            guestNames: singleOrder.customerName ? [singleOrder.customerName] : [],
            guestPhones: singleOrder.phoneNumber ? [singleOrder.phoneNumber] : [],
            orderId: singleOrder._id,
          });
          await session.save();
          sessionsCreatedCount++;
        }

        singleOrder.sessionId = session._id as any;
        await singleOrder.save();
      }
    }

    console.log('\n===============================================================');
    console.log('MIGRATION COMPLETE SUMMARY:');
    console.log(`- Multi-order tables merged: ${mergedTablesCount}`);
    console.log(`- Duplicate orders cancelled: ${cancelledOrdersCount}`);
    console.log(`- Orphan bills voided: ${voidedBillsCount}`);
    console.log(`- Active TableSessions created: ${sessionsCreatedCount}`);
    console.log('===============================================================\n');
  } catch (err: any) {
    console.error('[Migration Error]:', err);
    throw err;
  }
}

if (require.main === module) {
  runTableSessionMigration()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}
