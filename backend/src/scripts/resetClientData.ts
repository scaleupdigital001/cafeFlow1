import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables from backend .env
dotenv.config({ path: path.join(__dirname, '../../.env') });

import Restaurant from '../models/Restaurant';
import User from '../models/User';
import Dish from '../models/Dish';
import Table from '../models/Table';
import Order from '../models/Order';
import Bill from '../models/Bill';
import TableSession from '../models/TableSession';
import WaiterRequest from '../models/WaiterRequest';
import Otp from '../models/Otp';

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/cafeflow';

export async function runClientDataReset(executeFlag: boolean = false, targetSlug?: string) {
  console.log('\n===============================================================');
  console.log('      CAFEFLOW PRODUCTION DATABASE HANDOVER & DATA RESET       ');
  console.log('===============================================================');
  console.log(`[Config] MongoDB URI: ${MONGO_URI.replace(/:([^@]+)@/, ':****@')}`);
  console.log(`[Config] Execution Mode: ${executeFlag ? 'LIVE DELETION (--execute)' : 'READ-ONLY AUDIT MODE'}`);
  if (targetSlug) {
    console.log(`[Config] Target Restaurant Slug Filter: "${targetSlug}"`);
  }

  try {
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(MONGO_URI);
      console.log(`[Database] Connected successfully to "${mongoose.connection.name}" database.`);
    }

    // -----------------------------------------------------------------
    // STEP 1: RESOLVE TENANT SCOPE (IF TARGET SLUG SPECIFIED)
    // -----------------------------------------------------------------
    let targetRestaurant = null;
    let restaurantFilter: any = {};
    let orderFilter: any = {};
    let billFilter: any = {};
    let sessionFilter: any = {};
    let waiterFilter: any = {};

    if (targetSlug) {
      targetRestaurant = await Restaurant.findOne({ slug: targetSlug });
      if (!targetRestaurant) {
        console.error(`❌ ERROR: Restaurant with slug "${targetSlug}" not found! Aborting.`);
        process.exit(1);
      }
      const restId = targetRestaurant._id;
      restaurantFilter = { _id: restId };
      orderFilter = { restaurantId: restId };
      billFilter = { restaurantId: restId };
      sessionFilter = { restaurantId: restId };
      waiterFilter = { restaurantId: restId };
      console.log(`[Target] Scope restricted to Restaurant: "${targetRestaurant.name}" (ID: ${restId})`);
    }

    // -----------------------------------------------------------------
    // STEP 2: PRE-CLEANUP READ-ONLY AUDIT
    // -----------------------------------------------------------------
    console.log('\n--- PRE-CLEANUP DATABASE AUDIT ---');

    // Preserved Master Data
    const restaurantCount = await Restaurant.countDocuments(restaurantFilter);
    const userCount = await User.countDocuments(targetRestaurant ? { restaurantId: targetRestaurant._id } : {});
    const dishCount = await Dish.countDocuments(targetRestaurant ? { restaurantId: targetRestaurant._id } : {});
    const tableCount = await Table.countDocuments(targetRestaurant ? { restaurantId: targetRestaurant._id } : {});
    
    // Derived Categories
    const dishesList = await Dish.find(targetRestaurant ? { restaurantId: targetRestaurant._id } : {}, 'category');
    const categoriesSet = new Set(dishesList.map((d) => d.category).filter(Boolean));
    const categoryCount = categoriesSet.size;

    console.log('\n[PRESERVE MASTER CONFIGURATION]');
    console.log(`  ├─ Restaurants: ${restaurantCount}`);
    console.log(`  ├─ Admin/Staff Accounts: ${userCount}`);
    console.log(`  ├─ Menu Categories: ${categoryCount} (${Array.from(categoriesSet).join(', ')})`);
    console.log(`  ├─ Menu Dishes: ${dishCount}`);
    console.log(`  └─ Dining Tables & QR Mappings: ${tableCount}`);

    // Transactional Data
    const orderCount = await Order.countDocuments(orderFilter);
    const billCount = await Bill.countDocuments(billFilter);
    const sessionCount = await TableSession.countDocuments(sessionFilter);
    const waiterRequestCount = await WaiterRequest.countDocuments(waiterFilter);
    const otpCount = await Otp.countDocuments({});

    console.log('\n[DELETE TRANSACTIONAL & OPERATIONAL DATA]');
    console.log(`  ├─ Orders (QR & POS): ${orderCount}`);
    console.log(`  ├─ Bills & Invoices: ${billCount}`);
    console.log(`  ├─ Active & Grace TableSessions: ${sessionCount}`);
    console.log(`  ├─ Waiter / Bill Alerts: ${waiterRequestCount}`);
    console.log(`  └─ OTP Tokens: ${otpCount}`);

    // -----------------------------------------------------------------
    // STEP 3: SAFETY ASSERTIONS BEFORE ANY DELETION
    // -----------------------------------------------------------------
    console.log('\n--- VERIFYING SAFETY CONSTRAINTS ---');
    if (restaurantCount === 0) {
      console.error('❌ SAFETY ABORT: Zero restaurants found in target database! Aborting to prevent data corruption.');
      process.exit(1);
    }
    if (dishCount === 0) {
      console.error('❌ SAFETY ABORT: Zero dishes found! Cannot perform transactional cleanup on unseeded menu.');
      process.exit(1);
    }
    if (tableCount === 0) {
      console.error('❌ SAFETY ABORT: Zero dining tables found! Aborting.');
      process.exit(1);
    }
    console.log('✅ Safety checks passed: Master cafe configuration documents confirmed intact.');

    // -----------------------------------------------------------------
    // STEP 4: EXECUTION VS READ-ONLY AUDIT
    // -----------------------------------------------------------------
    if (!executeFlag) {
      console.log('\n===============================================================');
      console.log('  READ-ONLY AUDIT COMPLETE. NO DELETIONS WERE PERFORMED.      ');
      console.log('  To execute live deletion of transactional data, run with:    ');
      console.log('  npx ts-node src/scripts/resetClientData.ts --execute         ');
      console.log('===============================================================\n');
      return;
    }

    console.log('\n===============================================================');
    console.log('  EXECUTING LIVE TRANSACTIONAL DATA CLEANUP...                ');
    console.log('===============================================================');

    // 1. Delete Orders
    const delOrders = await Order.deleteMany(orderFilter);
    console.log(`[Clean] Deleted ${delOrders.deletedCount} Order records.`);

    // 2. Delete Bills
    const delBills = await Bill.deleteMany(billFilter);
    console.log(`[Clean] Deleted ${delBills.deletedCount} Bill records.`);

    // 3. Delete TableSessions
    const delSessions = await TableSession.deleteMany(sessionFilter);
    console.log(`[Clean] Deleted ${delSessions.deletedCount} TableSession records.`);

    // 4. Delete WaiterRequests
    const delWaiter = await WaiterRequest.deleteMany(waiterFilter);
    console.log(`[Clean] Deleted ${delWaiter.deletedCount} WaiterRequest records.`);

    // 5. Delete OTPs (transient)
    if (!targetSlug) {
      const delOtps = await Otp.deleteMany({});
      console.log(`[Clean] Deleted ${delOtps.deletedCount} Otp records.`);
    }

    // -----------------------------------------------------------------
    // STEP 5: POST-CLEANUP VERIFICATION & AUDIT
    // -----------------------------------------------------------------
    console.log('\n===============================================================');
    console.log('       POST-CLEANUP VERIFICATION & DATA INTEGRITY AUDIT        ');
    console.log('===============================================================');

    const postRestaurantCount = await Restaurant.countDocuments(restaurantFilter);
    const postUserCount = await User.countDocuments(targetRestaurant ? { restaurantId: targetRestaurant._id } : {});
    const postDishCount = await Dish.countDocuments(targetRestaurant ? { restaurantId: targetRestaurant._id } : {});
    const postTableCount = await Table.countDocuments(targetRestaurant ? { restaurantId: targetRestaurant._id } : {});

    const postOrderCount = await Order.countDocuments(orderFilter);
    const postBillCount = await Bill.countDocuments(billFilter);
    const postSessionCount = await TableSession.countDocuments(sessionFilter);
    const postWaiterCount = await WaiterRequest.countDocuments(waiterFilter);

    console.log('\n[PRESERVED MASTER DATA ASSERTIONS]');
    console.log(`  ├─ Restaurant Preserved (${postRestaurantCount}/${restaurantCount}): ${postRestaurantCount === restaurantCount ? 'PASS ✅' : 'FAIL ❌'}`);
    console.log(`  ├─ Users Preserved (${postUserCount}/${userCount}): ${postUserCount === userCount ? 'PASS ✅' : 'FAIL ❌'}`);
    console.log(`  ├─ Dishes Preserved (${postDishCount}/${dishCount}): ${postDishCount === dishCount ? 'PASS ✅' : 'FAIL ❌'}`);
    console.log(`  └─ Tables & QR Preserved (${postTableCount}/${tableCount}): ${postTableCount === tableCount ? 'PASS ✅' : 'FAIL ❌'}`);

    console.log('\n[TRANSACTIONAL ZERO-STATE ASSERTIONS]');
    console.log(`  ├─ Orders Cleared (Count: ${postOrderCount}): ${postOrderCount === 0 ? 'PASS ✅' : 'FAIL ❌'}`);
    console.log(`  ├─ Bills Cleared (Count: ${postBillCount}): ${postBillCount === 0 ? 'PASS ✅' : 'FAIL ❌'}`);
    console.log(`  ├─ TableSessions Cleared (Count: ${postSessionCount}): ${postSessionCount === 0 ? 'PASS ✅' : 'FAIL ❌'}`);
    console.log(`  └─ Waiter Requests Cleared (Count: ${postWaiterCount}): ${postWaiterCount === 0 ? 'PASS ✅' : 'FAIL ❌'}`);

    const allPassed =
      postRestaurantCount === restaurantCount &&
      postUserCount === userCount &&
      postDishCount === dishCount &&
      postTableCount === tableCount &&
      postOrderCount === 0 &&
      postBillCount === 0 &&
      postSessionCount === 0 &&
      postWaiterCount === 0;

    console.log('\n===============================================================');
    if (allPassed) {
      console.log(' 🎉 SUCCESS: DATABASE IS CLEAN AND FULLY READY FOR CLIENT HANDOVER!');
      console.log('    All master cafe data, QR codes, dishes, and staff accounts remain 100% intact.');
      console.log('    All sales, orders, bills, and session history have been reset to ZERO.');
    } else {
      console.error(' ❌ WARNING: Verification failed! Check assertion outputs above.');
    }
    console.log('===============================================================\n');

  } catch (error: any) {
    console.error('❌ FATAL ERROR during data reset script execution:', error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('[Database] MongoDB connection closed.');
  }
}

// Execution Entry Point
if (require.main === module) {
  const args = process.argv.slice(2);
  const executeFlag = args.includes('--execute') || process.env.EXECUTE_CLEANUP === 'true';
  const slugArgIdx = args.indexOf('--slug');
  const targetSlug = slugArgIdx !== -1 && args[slugArgIdx + 1] ? args[slugArgIdx + 1] : undefined;

  runClientDataReset(executeFlag, targetSlug);
}
