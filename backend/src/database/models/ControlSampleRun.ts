import mongoose, { Document, Schema } from "mongoose";
import { tenantScopePlugin } from "../plugins/tenantScope.plugin";

export type IControlSampleRun = Document & {
  tenantId: string;
  instrumentName: string;
  instrumentCode: string;
  controlLevel: string;
  parameterName: string;
  targetMean: number;
  targetSd: number;
  observedValue: number;
  zScore: number;
  status: "PASSED" | "WARNING" | "REJECTED";
  violatedRule?: string | null;
  runDate: Date;
};

const controlSampleRunSchema = new Schema<IControlSampleRun>(
  {
    instrumentName: { type: String, required: true },
    instrumentCode: { type: String, required: true },
    controlLevel: { type: String, required: true },
    parameterName: { type: String, required: true },
    targetMean: { type: Number, required: true },
    targetSd: { type: Number, required: true },
    observedValue: { type: Number, required: true },
    zScore: { type: Number, required: true },
    status: { type: String, enum: ["PASSED", "WARNING", "REJECTED"], default: "PASSED" },
    violatedRule: { type: String, default: null },
    runDate: { type: Date, required: true }
  },
  { timestamps: true }
);

controlSampleRunSchema.plugin(tenantScopePlugin);
controlSampleRunSchema.index({ tenantId: 1, runDate: -1 });

export const ControlSampleRunModel =
  mongoose.models.ControlSampleRun ?? mongoose.model<IControlSampleRun>("ControlSampleRun", controlSampleRunSchema);
