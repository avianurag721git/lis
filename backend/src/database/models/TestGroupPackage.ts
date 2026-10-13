import mongoose, { Document, Schema } from "mongoose";
import { tenantScopePlugin } from "../plugins/tenantScope.plugin";

export type ITestGroupPackage = Document & {
  tenantId: string;
  code: string;
  name: string;
  testCodes: string[];
  retailPriceMinor: number;
  b2bPackagePriceMinor: number;
};

const testGroupPackageSchema = new Schema<ITestGroupPackage>(
  {
    code: { type: String, required: true },
    name: { type: String, required: true },
    testCodes: { type: [String], default: [] },
    retailPriceMinor: { type: Number, default: 0 },
    b2bPackagePriceMinor: { type: Number, default: 0 }
  },
  { timestamps: true }
);

testGroupPackageSchema.plugin(tenantScopePlugin);
testGroupPackageSchema.index({ tenantId: 1, code: 1 }, { unique: true });

export const TestGroupPackageModel =
  mongoose.models.TestGroupPackage ?? mongoose.model<ITestGroupPackage>("TestGroupPackage", testGroupPackageSchema);
