import mongoose, { Document, Schema } from "mongoose";
import { tenantScopePlugin } from "../plugins/tenantScope.plugin";

export type ITestCatalog = Document & {
  tenantId: string;
  testCode: string;
  testName: string;
  department: string;
  priceMinor: number;
  isActive: boolean;
};

const testCatalogSchema = new Schema<ITestCatalog>(
  {
    testCode: { type: String, required: true },
    testName: { type: String, required: true },
    department: { type: String, default: "GENERAL" },
    priceMinor: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true }
  },
  { timestamps: true }
);

testCatalogSchema.plugin(tenantScopePlugin);
testCatalogSchema.index({ tenantId: 1, testCode: 1 }, { unique: true });

export const TestCatalogModel =
  mongoose.models.TestCatalog ?? mongoose.model<ITestCatalog>("TestCatalog", testCatalogSchema);
