import mongoose, { Document, Schema } from "mongoose";
import { tenantScopePlugin } from "../plugins/tenantScope.plugin";

export type ILabResult = Document & {
  tenantId: string;
  orderId: string;
  testCode: string;
  value: string | null;
  unit: string | null;
  verifiedAt: Date | null;
};

const labResultSchema = new Schema<ILabResult>(
  {
    orderId: { type: String, required: true },
    testCode: { type: String, required: true },
    value: { type: String, default: null },
    unit: { type: String, default: null },
    verifiedAt: { type: Date, default: null }
  },
  { timestamps: true }
);

labResultSchema.plugin(tenantScopePlugin);
labResultSchema.index({ tenantId: 1, orderId: 1, testCode: 1 });

export const LabResultModel = mongoose.models.LabResult ?? mongoose.model<ILabResult>("LabResult", labResultSchema);
