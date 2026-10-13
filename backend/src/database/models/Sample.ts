import mongoose, { Document, Schema } from "mongoose";
import { tenantScopePlugin } from "../plugins/tenantScope.plugin";

export type ISample = Document & {
  tenantId: string;
  orderId: string;
  barcode: string;
  status: string;
  collectedAt: Date | null;
};

const sampleSchema = new Schema<ISample>(
  {
    orderId: { type: String, required: true },
    barcode: { type: String, required: true },
    status: { type: String, default: "COLLECTED" },
    collectedAt: { type: Date, default: null }
  },
  { timestamps: true }
);

sampleSchema.plugin(tenantScopePlugin);
sampleSchema.index({ tenantId: 1, barcode: 1 }, { unique: true });

export const SampleModel = mongoose.models.Sample ?? mongoose.model<ISample>("Sample", sampleSchema);
