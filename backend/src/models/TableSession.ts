import mongoose, { Schema, Document } from 'mongoose';

export interface ITableSession extends Document {
  restaurantId: mongoose.Types.ObjectId;
  tableNumber: string; // Canonical form (e.g. "12")
  rawTableNumber?: string; // Display form (e.g. "Table 12")
  status: 'active' | 'grace' | 'closed';
  graceEndsAt?: Date; // Expiration timestamp for grace period
  customerName: string; // Primary guest name (first to initiate session)
  phoneNumber: string; // Primary guest phone
  guestNames: string[]; // List of all unique guest names attached to this table session
  guestPhones: string[]; // List of all unique guest phone numbers
  processedClientOrderIds: string[]; // Priority 1: Idempotency keys for request deduplication
  orderId: mongoose.Types.ObjectId; // Single consolidated Order
  createdAt: Date;
  updatedAt: Date;
}

const TableSessionSchema: Schema = new Schema(
  {
    restaurantId: {
      type: Schema.Types.ObjectId,
      ref: 'Restaurant',
      required: true,
      index: true,
    },
    tableNumber: { type: String, required: true },
    rawTableNumber: { type: String },
    status: {
      type: String,
      enum: ['active', 'grace', 'closed'],
      default: 'active',
      index: true,
    },
    graceEndsAt: { type: Date },
    customerName: { type: String, default: 'Guest' },
    phoneNumber: { type: String, default: '' },
    guestNames: [{ type: String }],
    guestPhones: [{ type: String }],
    processedClientOrderIds: [{ type: String }],
    orderId: {
      type: Schema.Types.ObjectId,
      ref: 'Order',
      required: true,
    },
  },
  { timestamps: true }
);

// CRITICAL DB CONSTRAINT: Partial unique index guarantees AT MOST ONE active/grace session per table per tenant!
TableSessionSchema.index(
  { restaurantId: 1, tableNumber: 1, status: 1 },
  { unique: true, partialFilterExpression: { status: { $in: ['active', 'grace'] } } }
);

export default mongoose.model<ITableSession>('TableSession', TableSessionSchema);
