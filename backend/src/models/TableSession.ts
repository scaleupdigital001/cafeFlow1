import mongoose, { Schema, Document } from 'mongoose';

export interface ITableSession extends Document {
  restaurantId: mongoose.Types.ObjectId;
  tableNumber: string;
  status: 'active' | 'closed';
  customerName: string; // Primary guest name (first to initiate session)
  phoneNumber: string; // Primary guest phone
  guestNames: string[]; // List of all unique guest names attached to this table session
  guestPhones: string[]; // List of all unique guest phone numbers
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
    status: { type: String, enum: ['active', 'closed'], default: 'active', index: true },
    customerName: { type: String, default: 'Guest' },
    phoneNumber: { type: String, default: '' },
    guestNames: [{ type: String }],
    guestPhones: [{ type: String }],
    orderId: {
      type: Schema.Types.ObjectId,
      ref: 'Order',
      required: true,
    },
  },
  { timestamps: true }
);

// CRITICAL DB CONSTRAINT: Partial unique index guarantees AT MOST ONE active session per table per tenant!
TableSessionSchema.index(
  { restaurantId: 1, tableNumber: 1, status: 1 },
  { unique: true, partialFilterExpression: { status: 'active' } }
);

export default mongoose.model<ITableSession>('TableSession', TableSessionSchema);
