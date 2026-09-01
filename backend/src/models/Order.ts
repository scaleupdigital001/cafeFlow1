import mongoose, { Schema, Document } from 'mongoose';

export interface IOrderItem {
  dishId: mongoose.Types.ObjectId;
  name: string;
  price: number;
  quantity: number;
  customizations?: {
    name: string;
    selectedOption: string;
    extraPrice: number;
  }[];
  specialInstructions?: string;
}

export interface IOrder extends Document {
  restaurantId: mongoose.Types.ObjectId;
  sessionId?: mongoose.Types.ObjectId;
  customerName: string;
  phoneNumber: string;
  tableNumber: string;
  items: IOrderItem[];
  status: 'received' | 'accepted' | 'preparing' | 'ready' | 'served' | 'completed' | 'cancelled';
  billRequested: boolean;
  subtotal: number;
  tax: number;
  totalAmount: number;
  mergeNote?: string;
  createdAt: Date;
  updatedAt: Date;
}

const OrderItemSchema = new Schema({
  dishId: { type: Schema.Types.ObjectId, ref: 'Dish', required: true },
  name: { type: String, required: true },
  price: { type: Number, required: true },
  quantity: { type: Number, required: true, min: 1 },
  customizations: [
    {
      name: { type: String, required: true }, // e.g., "Spice Level"
      selectedOption: { type: String, required: true }, // e.g., "Medium"
      extraPrice: { type: Number, default: 0 },
    },
  ],
  specialInstructions: { type: String },
});

const OrderSchema: Schema = new Schema(
  {
    restaurantId: {
      type: Schema.Types.ObjectId,
      ref: 'Restaurant',
      required: true,
      index: true,
    },
    sessionId: {
      type: Schema.Types.ObjectId,
      ref: 'TableSession',
      index: true,
    },
    customerName: { type: String, default: 'Guest' },
    phoneNumber: { type: String, default: '' },
    tableNumber: { type: String, required: true },
    items: [OrderItemSchema],
    status: {
      type: String,
      enum: ['received', 'accepted', 'preparing', 'ready', 'served', 'completed', 'cancelled'],
      default: 'received',
      index: true,
    },
    billRequested: { type: Boolean, default: false },
    subtotal: { type: Number, required: true },
    tax: { type: Number, required: true },
    totalAmount: { type: Number, required: true },
    mergeNote: { type: String },
  },
  { timestamps: true }
);

// Compound indexes matching high-frequency query patterns
OrderSchema.index({ restaurantId: 1, createdAt: -1 });
OrderSchema.index({ restaurantId: 1, status: 1, createdAt: -1 });
OrderSchema.index({ restaurantId: 1, tableNumber: 1, status: 1 });

export default mongoose.model<IOrder>('Order', OrderSchema);
