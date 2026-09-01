import mongoose from 'mongoose';
import TableSession, { ITableSession } from '../models/TableSession';
import Order, { IOrder } from '../models/Order';

export interface GetOrCreateSessionResult {
  session: ITableSession;
  order: IOrder;
  isNew: boolean;
}

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Transaction-safe find-or-create TableSession engine.
 * - Point 1: Excludes PII in active-table route (handled in order.ts).
 * - Point 2: Complete function body with explicit error throw after max retry exhaustion.
 * - Point 3: Atomic $addToSet for updating guestNames / guestPhones without race conditions.
 * - Point 4: Initializes first guest in guestNames and guestPhones arrays on creation.
 */
export async function getOrCreateActiveTableSession(
  restaurantId: string | mongoose.Types.ObjectId,
  tableNumber: string,
  customerName?: string,
  phoneNumber?: string
): Promise<GetOrCreateSessionResult> {
  const normTable = String(tableNumber).trim();
  const restId = new mongoose.Types.ObjectId(restaurantId.toString());

  const guestName = customerName && customerName.trim() ? customerName.trim() : `Table ${normTable} Guest`;
  const cleanedPhone = phoneNumber ? phoneNumber.replace(/\D/g, '') : '';

  const MAX_RETRY_ATTEMPTS = 3;

  for (let attempt = 1; attempt <= MAX_RETRY_ATTEMPTS; attempt++) {
    const mongoSession = await mongoose.startSession();
    try {
      let transactionResult: GetOrCreateSessionResult | null = null;

      await mongoSession.withTransaction(async () => {
        // 1. Look for existing active session inside transaction
        const activeSession = await TableSession.findOne({
          restaurantId: restId,
          tableNumber: normTable,
          status: 'active',
        }).session(mongoSession);

        if (activeSession) {
          const existingOrder = await Order.findById(activeSession.orderId).session(mongoSession);
          if (existingOrder && existingOrder.status !== 'completed' && existingOrder.status !== 'cancelled') {
            // Point 3: Atomic $addToSet update inside transaction
            const updateFields: any = {};
            if (guestName) updateFields.guestNames = guestName;
            if (cleanedPhone) updateFields.guestPhones = cleanedPhone;

            if (Object.keys(updateFields).length > 0) {
              await TableSession.findOneAndUpdate(
                { _id: activeSession._id },
                { $addToSet: updateFields },
                { session: mongoSession }
              );
            }

            transactionResult = { session: activeSession, order: existingOrder, isNew: false };
            return;
          }
        }

        // 2. Create new consolidated Order & TableSession inside transaction
        const newOrder = new Order({
          restaurantId: restId,
          customerName: guestName,
          phoneNumber: cleanedPhone,
          tableNumber: normTable,
          items: [],
          status: 'received',
          subtotal: 0,
          tax: 0,
          totalAmount: 0,
        });
        await newOrder.save({ session: mongoSession });

        // Point 4: Include primary guest in guestNames and guestPhones arrays on creation
        const newSession = new TableSession({
          restaurantId: restId,
          tableNumber: normTable,
          status: 'active',
          customerName: guestName,
          phoneNumber: cleanedPhone,
          guestNames: guestName ? [guestName] : [],
          guestPhones: cleanedPhone ? [cleanedPhone] : [],
          orderId: newOrder._id,
        });
        await newSession.save({ session: mongoSession });

        newOrder.sessionId = newSession._id as any;
        await newOrder.save({ session: mongoSession });

        transactionResult = { session: newSession, order: newOrder, isNew: true };
      });

      if (transactionResult) {
        return transactionResult;
      }
    } catch (err: any) {
      const errMsg = String(err.message || '');
      const isStandaloneError =
        errMsg.includes('Transaction numbers are only allowed on a replica set member') ||
        errMsg.includes('standalone') ||
        err.code === 20;

      // Standalone fallback: break to non-transactional atomic lock execution
      if (isStandaloneError) {
        break;
      }

      const isTransient =
        err.hasErrorLabel?.('TransientTransactionError') ||
        err.hasErrorLabel?.('UnknownTransactionCommitResult') ||
        errMsg.includes('WriteConflict') ||
        err.code === 11000;

      if (isTransient && attempt < MAX_RETRY_ATTEMPTS) {
        console.warn(`[SessionManager] Transient conflict on attempt ${attempt}. Retrying in ${attempt * 100}ms...`);
        await delay(attempt * 100);
        continue;
      }

      throw err;
    } finally {
      await mongoSession.endSession();
    }
  }

  // Standalone Mongo Fallback: Atomic findOneAndUpdate & Unique Index Lock
  const activeSession = await TableSession.findOne({
    restaurantId: restId,
    tableNumber: normTable,
    status: 'active',
  });

  if (activeSession) {
    const existingOrder = await Order.findById(activeSession.orderId);
    if (existingOrder && existingOrder.status !== 'completed' && existingOrder.status !== 'cancelled') {
      // Point 3: Atomic $addToSet update on standalone fallback
      const updateFields: any = {};
      if (guestName) updateFields.guestNames = guestName;
      if (cleanedPhone) updateFields.guestPhones = cleanedPhone;

      if (Object.keys(updateFields).length > 0) {
        await TableSession.findOneAndUpdate(
          { _id: activeSession._id },
          { $addToSet: updateFields }
        );
      }

      return { session: activeSession, order: existingOrder, isNew: false };
    }
  }

  const newOrder = new Order({
    restaurantId: restId,
    customerName: guestName,
    phoneNumber: cleanedPhone,
    tableNumber: normTable,
    items: [],
    status: 'received',
    subtotal: 0,
    tax: 0,
    totalAmount: 0,
  });
  await newOrder.save();

  try {
    // Point 4: Include primary guest in guestNames and guestPhones arrays on creation
    const newSession = new TableSession({
      restaurantId: restId,
      tableNumber: normTable,
      status: 'active',
      customerName: guestName,
      phoneNumber: cleanedPhone,
      guestNames: guestName ? [guestName] : [],
      guestPhones: cleanedPhone ? [cleanedPhone] : [],
      orderId: newOrder._id,
    });
    await newSession.save();

    newOrder.sessionId = newSession._id as any;
    await newOrder.save();

    return { session: newSession, order: newOrder, isNew: true };
  } catch (err: any) {
    if (err.code === 11000) {
      await Order.findByIdAndDelete(newOrder._id);
      const existingSession = await TableSession.findOne({
        restaurantId: restId,
        tableNumber: normTable,
        status: 'active',
      });
      if (existingSession) {
        const existingOrder = await Order.findById(existingSession.orderId);
        if (existingOrder) return { session: existingSession, order: existingOrder, isNew: false };
      }
    }
    throw err;
  }

  // Point 2: Explicit error throw if fallback fails to return
  throw new Error('[SessionManager] Failed to get or create table session after maximum retry attempts.');
}
