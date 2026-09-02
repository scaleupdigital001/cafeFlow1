import mongoose, { Schema, Document } from 'mongoose';

export interface IReportAdjustment extends Document {
  tenantId: mongoose.Types.ObjectId;
  reportDate: string; // YYYY-MM-DD
  itemName: string;
  originalQty: number;
  adjustedQty: number;
  adjustedBy?: mongoose.Types.ObjectId;
  adjustedByName?: string;
  adjustedAt: Date;
  reason?: string;
}

const ReportAdjustmentSchema: Schema = new Schema(
  {
    tenantId: {
      type: Schema.Types.ObjectId,
      ref: 'Restaurant',
      required: true,
      index: true,
    },
    reportDate: {
      type: String,
      required: true,
      index: true,
    },
    itemName: {
      type: String,
      required: true,
    },
    originalQty: {
      type: Number,
      required: true,
    },
    adjustedQty: {
      type: Number,
      required: true,
    },
    adjustedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
    adjustedByName: {
      type: String,
      default: 'Admin User',
    },
    adjustedAt: {
      type: Date,
      default: Date.now,
    },
    reason: {
      type: String,
      default: '',
    },
  },
  {
    timestamps: true,
  }
);

// Compound index for fast lookup and unique constraint per tenant + report date + item name
ReportAdjustmentSchema.index({ tenantId: 1, reportDate: 1, itemName: 1 }, { unique: true });

export default mongoose.model<IReportAdjustment>('ReportAdjustment', ReportAdjustmentSchema);
