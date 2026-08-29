import mongoose, { Schema, Document } from 'mongoose';

export interface IBill extends Document {
  billNumber: string;
  restaurantId: mongoose.Types.ObjectId;
  orderId: mongoose.Types.ObjectId;
  subtotal: number;
  tax: number;
  totalAmount: number;
  pdfUrl?: string;
  paymentStatus: 'pending' | 'verifying' | 'paid';
  paymentMethod?: 'upi_link' | 'cash';
  createdAt: Date;
  updatedAt: Date;
}

const BillSchema: Schema = new Schema(
  {
    billNumber: { type: String, required: true, unique: true, index: true },
    restaurantId: {
      type: Schema.Types.ObjectId,
      ref: 'Restaurant',
      required: true,
      index: true,
    },
    orderId: {
      type: Schema.Types.ObjectId,
      ref: 'Order',
      required: true,
      unique: true,
    },
    subtotal: { type: Number, required: true },
    tax: { type: Number, required: true },
    totalAmount: { type: Number, required: true },
    pdfUrl: { type: String },
    paymentStatus: { type: String, enum: ['pending', 'verifying', 'paid'], default: 'pending', index: true },
    paymentMethod: { type: String, enum: ['upi_link', 'cash'] },
  },
  { timestamps: true }
);

// Compound index matching sales report queries
BillSchema.index({ restaurantId: 1, paymentStatus: 1, updatedAt: -1 });

export default mongoose.model<IBill>('Bill', BillSchema);
