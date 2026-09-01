import mongoose from 'mongoose';
import TableSession, { ITableSession } from '../models/TableSession';
import Order, { IOrder } from '../models/Order';
import { canonicalTableKey } from './tableUtils';

export interface GetOrCreateSessionResult {
  session: ITableSession;
  order: IOrder;
  isNew: boolean;
  isDuplicateRequest?: boolean;
}

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Transaction-safe find-or-create TableSession engine.
 * - Priority 1: Idempotency check via clientOrderId.
 * - Priority 2: Canonical table number normalization (canonicalTableKey).
 * - Priority 3: 3-State Lifecycle ('active' | 'grace' | 'closed'). Auto-reopens 'grace' sessions on new order.
 */
export async function getOrCreateActiveTableSession(
  restaurantId: string | mongoose.Types.ObjectId,
  rawTableInput: string,
  customerName?: string,
  phoneNumber?: string,
  clientOrderId?: string
): Promise<GetOrCreateSessionResult> {
  const normTable = canonicalTableKey(rawTableInput);
  const restId = new mongoose.Types.ObjectId(restaurantId.toString());

  const guestName = customerName && customerName.trim() ? customerName.trim() : `Table ${normTable} Guest`;
  const cleanedPhone = phoneNumber ? phoneNumber.replace(/\D/g, '') : '';

  const MAX_RETRY_ATTEMPTS = 3;

  for (let attempt = 1; attempt <= MAX_RETRY_ATTEMPTS; attempt++) {
    const mongoSession = await mongoose.startSession();
    try {
      let transactionResult: GetOrCreateSessionResult | null = null;

      await mongoSession.withTransaction(async () => {
        // 1. Look for existing active OR grace session inside transaction
        let activeSession = await TableSession.findOne({
          restaurantId: restId,
          tableNumber: normTable,
          status: { $in: ['active', 'grace'] },
        }).session(mongoSession);

        if (activeSession) {
          // Priority 1: Idempotency check
          if (clientOrderId && activeSession.processedClientOrderIds?.includes(clientOrderId)) {
            const existingOrder = await Order.findById(activeSession.orderId).session(mongoSession);
            if (existingOrder) {
              transactionResult = { session: activeSession, order: existingOrder, isNew: false, isDuplicateRequest: true };
              return;
            }
          }

          const existingOrder = await Order.findById(activeSession.orderId).session(mongoSession);
          if (existingOrder && existingOrder.status !== 'completed' && existingOrder.status !== 'cancelled') {
            // Priority 3: Auto-reopen 'grace' session back to 'active' on new order submission
            if (activeSession.status === 'grace') {
              activeSession.status = 'active';
              activeSession.graceEndsAt = undefined;
            }

            // Priority 1 & 3: Atomic update of guest lists and idempotency key
            const updateOps: any = {};
            const addToSetFields: any = {};
            if (guestName) addToSetFields.guestNames = guestName;
            if (cleanedPhone) addToSetFields.guestPhones = cleanedPhone;
            if (clientOrderId) addToSetFields.processedClientOrderIds = clientOrderId;

            if (Object.keys(addToSetFields).length > 0) {
              updateOps.$addToSet = addToSetFields;
            }
            updateOps.$set = { status: 'active', graceEndsAt: null };

            await TableSession.findOneAndUpdate(
              { _id: activeSession._id },
              updateOps,
              { session: mongoSession }
            );

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

        const newSession = new TableSession({
          restaurantId: restId,
          tableNumber: normTable,
          rawTableNumber: String(rawTableInput).trim(),
          status: 'active',
          customerName: guestName,
          phoneNumber: cleanedPhone,
          guestNames: guestName ? [guestName] : [],
          guestPhones: cleanedPhone ? [cleanedPhone] : [],
          processedClientOrderIds: clientOrderId ? [clientOrderId] : [],
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
    status: { $in: ['active', 'grace'] },
  });

  if (activeSession) {
    if (clientOrderId && activeSession.processedClientOrderIds?.includes(clientOrderId)) {
      const existingOrder = await Order.findById(activeSession.orderId);
      if (existingOrder) {
        return { session: activeSession, order: existingOrder, isNew: false, isDuplicateRequest: true };
      }
    }

    const existingOrder = await Order.findById(activeSession.orderId);
    if (existingOrder && existingOrder.status !== 'completed' && existingOrder.status !== 'cancelled') {
      const updateOps: any = {};
      const addToSetFields: any = {};
      if (guestName) addToSetFields.guestNames = guestName;
      if (cleanedPhone) addToSetFields.guestPhones = cleanedPhone;
      if (clientOrderId) addToSetFields.processedClientOrderIds = clientOrderId;

      if (Object.keys(addToSetFields).length > 0) {
        updateOps.$addToSet = addToSetFields;
      }
      updateOps.$set = { status: 'active', graceEndsAt: null };

      await TableSession.findOneAndUpdate(
        { _id: activeSession._id },
        updateOps
      );

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
    const newSession = new TableSession({
      restaurantId: restId,
      tableNumber: normTable,
      rawTableNumber: String(rawTableInput).trim(),
      status: 'active',
      customerName: guestName,
      phoneNumber: cleanedPhone,
      guestNames: guestName ? [guestName] : [],
      guestPhones: cleanedPhone ? [cleanedPhone] : [],
      processedClientOrderIds: clientOrderId ? [clientOrderId] : [],
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
        status: { $in: ['active', 'grace'] },
      });
      if (existingSession) {
        const existingOrder = await Order.findById(existingSession.orderId);
        if (existingOrder) return { session: existingSession, order: existingOrder, isNew: false };
      }
    }
    throw err;
  }
}
