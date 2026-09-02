import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IQTItem {
  name: string;
  quantity: number;
  notes?: string;
}

export interface IQT extends Document {
  tenantId: mongoose.Types.ObjectId;
  tableNumber: string;
  orderId: mongoose.Types.ObjectId;
  items: IQTItem[];
  status: 'pending' | 'printed' | 'served';
  ticketNumber: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface IQTModel extends Model<IQT> {
  generateNextTicketNumber(tenantId: mongoose.Types.ObjectId | string, date?: Date): Promise<string>;
  createForOrder(order: {
    restaurantId?: mongoose.Types.ObjectId;
    tenantId?: mongoose.Types.ObjectId;
    tableNumber: string;
    _id: mongoose.Types.ObjectId;
    items: Array<{
      name: string;
      quantity: number;
      specialInstructions?: string;
      customizations?: Array<{ name: string; selectedOption: string }>;
    }>;
  }): Promise<IQT>;
}

const QTItemSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    quantity: { type: Number, required: true, min: 1 },
    notes: { type: String, default: '' },
  },
  { _id: false }
);

const QTSchema = new Schema<IQT, IQTModel>(
  {
    tenantId: {
      type: Schema.Types.ObjectId,
      ref: 'Restaurant',
      required: true,
      index: true,
    },
    tableNumber: {
      type: String,
      required: true,
      trim: true,
    },
    orderId: {
      type: Schema.Types.ObjectId,
      ref: 'Order',
      required: true,
      index: true,
    },
    items: {
      type: [QTItemSchema],
      required: true,
      validate: [
        (val: IQTItem[]) => Array.isArray(val) && val.length > 0,
        'QT must contain at least one item.',
      ],
    },
    status: {
      type: String,
      enum: ['pending', 'printed', 'served'],
      default: 'pending',
      index: true,
    },
    ticketNumber: {
      type: String,
      required: true,
      trim: true,
    },
  },
  { timestamps: true }
);

// Compound indexes as required for high performance queries
// 1. Fast lookup by tenantId + tableNumber + createdAt
QTSchema.index({ tenantId: 1, tableNumber: 1, createdAt: -1 });

// 2. Fast lookup by status for unprinted QTs queries per tenant
QTSchema.index({ tenantId: 1, status: 1, createdAt: -1 });

/**
 * Static method to generate human-readable ticket number/sequence per tenant per day.
 * Format: QT-YYYYMMDD-0001
 */
QTSchema.statics.generateNextTicketNumber = async function (
  tenantId: mongoose.Types.ObjectId | string,
  date: Date = new Date()
): Promise<string> {
  const startOfDay = new Date(date);
  startOfDay.setHours(0, 0, 0, 0);

  const endOfDay = new Date(date);
  endOfDay.setHours(23, 59, 59, 999);

  const tenantObjectId = typeof tenantId === 'string' ? new mongoose.Types.ObjectId(tenantId) : tenantId;

  // Count QTs issued today for this tenant
  const countToday = await this.countDocuments({
    tenantId: tenantObjectId,
    createdAt: { $gte: startOfDay, $lte: endOfDay },
  });

  const sequence = (countToday + 1).toString().padStart(4, '0');
  const dateStr = startOfDay.toISOString().slice(0, 10).replace(/-/g, '');

  return `QT-${dateStr}-${sequence}`;
};

/**
 * Helper to generate a new QT document automatically whenever a new Order is placed.
 */
QTSchema.statics.createForOrder = async function (order: {
  restaurantId?: mongoose.Types.ObjectId;
  tenantId?: mongoose.Types.ObjectId;
  tableNumber: string;
  _id: mongoose.Types.ObjectId;
  items: Array<{
    name: string;
    quantity: number;
    specialInstructions?: string;
    customizations?: Array<{ name: string; selectedOption: string }>;
  }>;
}): Promise<IQT> {
  const tenantId = order.tenantId || order.restaurantId;
  if (!tenantId) {
    throw new Error('Tenant identifier (tenantId/restaurantId) is required to create a QT.');
  }

  const ticketNumber = await this.generateNextTicketNumber(tenantId);

  const qtItems: IQTItem[] = order.items.map((item) => {
    const noteParts: string[] = [];
    if (item.specialInstructions && item.specialInstructions.trim()) {
      noteParts.push(item.specialInstructions.trim());
    }
    if (item.customizations && item.customizations.length > 0) {
      const custStr = item.customizations.map((c) => `${c.name}: ${c.selectedOption}`).join(', ');
      noteParts.push(custStr);
    }

    return {
      name: item.name,
      quantity: item.quantity,
      notes: noteParts.join(' | '),
    };
  });

  const qt = new this({
    tenantId,
    tableNumber: order.tableNumber,
    orderId: order._id,
    items: qtItems,
    status: 'pending',
    ticketNumber,
  });

  return await qt.save();
};

const QT = mongoose.model<IQT, IQTModel>('QT', QTSchema);
export default QT;
