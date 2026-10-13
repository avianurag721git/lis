import mongoose, { Document, Schema } from "mongoose";
import { tenantScopePlugin } from "../plugins/tenantScope.plugin";

export type IReagentBatch = Document & {
  tenantId: string;
  name: string;
  lotNumber: string;
  expiryDate: Date;
  remainingTests: number;
  reorderLevel: number;
  instrumentCode?: string | null;
};

const reagentBatchSchema = new Schema<IReagentBatch>(
  {
    name: { type: String, required: true },
    lotNumber: { type: String, required: true },
    expiryDate: { type: Date, required: true },
    remainingTests: { type: Number, required: true },
    reorderLevel: { type: Number, default: 100 },
    instrumentCode: { type: String, default: null }
  },
  { timestamps: true }
);

reagentBatchSchema.plugin(tenantScopePlugin);
reagentBatchSchema.index({ tenantId: 1, lotNumber: 1 }, { unique: true });

export const ReagentBatchModel =
  mongoose.models.ReagentBatch ?? mongoose.model<IReagentBatch>("ReagentBatch", reagentBatchSchema);
