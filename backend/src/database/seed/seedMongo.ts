import bcrypt from "bcryptjs";
import { connectMongo, isMongoConnected } from "../mongo";
import { TenantModel } from "../models/Tenant";
import { UserModel } from "../models/User";
import { PatientModel } from "../models/Patient";
import { TestCatalogModel } from "../models/TestCatalog";
import { TestGroupPackageModel } from "../models/TestGroupPackage";
import { FranchiseeWalletModel } from "../models/FranchiseeWallet";
import { OrderBookingModel } from "../models/OrderBooking";
import { SampleModel } from "../models/Sample";
import { LabResultModel } from "../models/LabResult";
import { ReagentBatchModel } from "../models/ReagentBatch";
import { ControlSampleRunModel } from "../models/ControlSampleRun";
import { seedLog } from "./seedLogger";
import {
  APOLLO_TENANT_ID,
  CITYLABS_TENANT_ID,
  CONTROL_VALUES,
  FRANCHISEE_ID,
  ORDER_IDS,
  PATIENT_IDS,
  PATHOLOGIST_SIGNATURE_URL,
  REAGENT_ROCHE_ID,
  REAGENT_SYSMEX_ID,
  SAMPLE_IDS,
  SEED_PASSWORD
} from "./productionSeed.constants";
import type { ProductionUserIds } from "../../modules/auth/productionUsers.seed";

const MIRROR_TENANTS = [APOLLO_TENANT_ID, CITYLABS_TENANT_ID];

/** Mirror PostgreSQL seed documents into Mongoose when MONGODB_URI is configured. */
export const syncMongoProductionSeed = async (users: ProductionUserIds): Promise<void> => {
  const connected = await connectMongo();
  if (!connected || !isMongoConnected()) {
    seedLog.warn("MONGODB_URI not set or connection failed — skipping Mongoose mirror");
    return;
  }

  seedLog.header("Mongoose Document Mirror (12 entities)");

  for (const tenantId of MIRROR_TENANTS) {
    await TenantModel.deleteMany({ slug: tenantId === APOLLO_TENANT_ID ? "apollo" : "citylabs" });
    await UserModel.deleteMany({ tenantId });
    await PatientModel.deleteMany({ tenantId });
    await TestCatalogModel.deleteMany({ tenantId });
    await TestGroupPackageModel.deleteMany({ tenantId });
    await FranchiseeWalletModel.deleteMany({ tenantId });
    await OrderBookingModel.deleteMany({ tenantId });
    await SampleModel.deleteMany({ tenantId });
    await LabResultModel.deleteMany({ tenantId });
    await ReagentBatchModel.deleteMany({ tenantId });
    await ControlSampleRunModel.deleteMany({ tenantId });
  }

  await TenantModel.create([
    {
      name: "Apollo Pathology Labs",
      slug: "apollo",
      customDomain: "apollo.yourdomain.com",
      subscriptionPlan: "ENTERPRISE",
      subscriptionStatus: "ACTIVE",
      branding: { primaryColor: "#0284c7", logoUrl: null, secondaryColor: "#b91c1c", labHeaderAddress: "", nablRegNo: "" }
    },
    {
      name: "City Diagnostic Center",
      slug: "citylabs",
      customDomain: null,
      subscriptionPlan: "PRO",
      subscriptionStatus: "ACTIVE",
      branding: { primaryColor: "#16a34a", logoUrl: null, secondaryColor: "#b91c1c", labHeaderAddress: "", nablRegNo: "" }
    }
  ]);
  seedLog.count("Tenant (Mongo)", 2);

  const passwordHash = await bcrypt.hash(SEED_PASSWORD, 12);
  const mongoUsers = [
    { tenantId: "platform", name: "Platform Super Admin", email: "admin@lis.com", role: "SUPER_ADMIN" },
    { tenantId: APOLLO_TENANT_ID, name: "Apollo Lab Manager", email: "manager@apollo.com", role: "LAB_MANAGER" },
    { tenantId: APOLLO_TENANT_ID, name: "Apollo Receptionist", email: "cashier@apollo.com", role: "RECEPTIONIST" },
    { tenantId: APOLLO_TENANT_ID, name: "Apollo Phlebotomist", email: "phleb@apollo.com", role: "PHLEBOTOMIST" },
    {
      tenantId: APOLLO_TENANT_ID,
      name: "Apollo Lab Technician",
      email: "tech@apollo.com",
      role: "LAB_TECH",
      department: "Hematology & Biochemistry"
    },
    {
      tenantId: APOLLO_TENANT_ID,
      name: "Dr. Apollo Pathologist",
      email: "doctor@apollo.com",
      role: "PATHOLOGIST",
      medicalLicense: "MCI-98412",
      digitalSignatureUrl: PATHOLOGIST_SIGNATURE_URL
    },
    { tenantId: APOLLO_TENANT_ID, name: "Care Diagnostics Franchisee", email: "center1@franchisee.com", role: "B2B_FRANCHISEE" },
    { tenantId: APOLLO_TENANT_ID, name: "Patient Portal User", email: "patient@gmail.com", role: "PATIENT" }
  ];
  await UserModel.insertMany(mongoUsers.map((u) => ({ ...u, passwordHash })) as never);
  seedLog.count("User (Mongo)", mongoUsers.length);

  await PatientModel.insertMany([
    { tenantId: APOLLO_TENANT_ID, patientCode: "LAB-20260830-1001", uhid: "LAB-20260830-1001", name: "Rajesh Kumar", phone: "9876543210", gender: "MALE", ageYears: 45 },
    { tenantId: APOLLO_TENANT_ID, patientCode: "LAB-20260830-1002", uhid: "LAB-20260830-1002", name: "Sunita Sharma", phone: "9876543211", gender: "FEMALE", ageYears: 32 },
    { tenantId: APOLLO_TENANT_ID, patientCode: "LAB-20260830-1003", uhid: "LAB-20260830-1003", name: "Master Aarav Singh", phone: null, gender: "MALE", ageYears: 8 },
    { tenantId: APOLLO_TENANT_ID, patientCode: "LAB-20260830-1004", uhid: "LAB-20260830-1004", name: "Vikram Patel", phone: "9876543212", gender: "MALE", ageYears: 62 },
    { tenantId: APOLLO_TENANT_ID, patientCode: "LAB-20260830-1005", uhid: "LAB-20260830-1005", name: "Anita Roy", phone: "9876543213", gender: "FEMALE", ageYears: 28 }
  ] as never);
  seedLog.count("Patient (Mongo)", 5);

  const testCodes = ["CBC001", "KFT001", "LFT001", "LIPID001", "HBA1C001", "THYROID001"];
  await TestCatalogModel.insertMany(
    testCodes.map((code) => ({
      tenantId: APOLLO_TENANT_ID,
      testCode: code,
      testName: code,
      department: code.startsWith("CBC") ? "Hematology" : code === "THYROID001" ? "Serology" : "Biochemistry",
      priceMinor: 35000,
      isActive: true
    })) as never
  );
  seedLog.count("TestCatalog (Mongo)", testCodes.length);

  await TestGroupPackageModel.insertMany([
    {
      tenantId: APOLLO_TENANT_ID,
      code: "PKG001",
      name: "Master Health Checkup Package",
      testCodes: ["CBC001", "KFT001", "LFT001", "LIPID001", "HBA1C001"],
      retailPriceMinor: 250000,
      b2bPackagePriceMinor: 140000
    },
    {
      tenantId: APOLLO_TENANT_ID,
      code: "PKG002",
      name: "Executive Cardiac & Diabetes Panel",
      testCodes: ["LIPID001", "HBA1C001", "KFT001"],
      retailPriceMinor: 160000,
      b2bPackagePriceMinor: 90000
    }
  ] as never);
  seedLog.count("TestGroupPackage (Mongo)", 2);

  await FranchiseeWalletModel.create({
    tenantId: APOLLO_TENANT_ID,
    franchiseeCode: "CARE-FRANCHISE",
    name: "Care Diagnostics Franchisee",
    balanceMinor: 4500000,
    creditLimitMinor: 1000000,
    transactions: [
      { type: "CREDIT", amountMinor: 5000000, balanceAfterMinor: 5000000, gatewayRef: "pay_RZP98412", note: "Initial Credit ₹50,000" },
      { type: "DEBIT", amountMinor: 500000, balanceAfterMinor: 4500000, note: "Order Debit ₹5,000 for batch samples" }
    ]
  });
  seedLog.count("FranchiseeWallet (Mongo)", 1);

  await OrderBookingModel.insertMany([
    { tenantId: APOLLO_TENANT_ID, orderNumber: "ORD-20260830-001", patientId: PATIENT_IDS.rajesh, status: "COMPLETED", totalAmountMinor: 250000 },
    { tenantId: APOLLO_TENANT_ID, orderNumber: "ORD-20260830-002", patientId: PATIENT_IDS.vikram, status: "PROCESSING", totalAmountMinor: 50000 },
    { tenantId: APOLLO_TENANT_ID, orderNumber: "ORD-20260830-003", patientId: PATIENT_IDS.sunita, status: "SAMPLE_COLLECTED", totalAmountMinor: 80000 },
    { tenantId: APOLLO_TENANT_ID, orderNumber: "ORD-20260830-004", patientId: PATIENT_IDS.anita, status: "BOOKED", totalAmountMinor: 60000 }
  ] as never);
  seedLog.count("OrderBooking (Mongo)", 4);

  await SampleModel.insertMany([
    { tenantId: APOLLO_TENANT_ID, orderId: ORDER_IDS.ord1, barcode: "BAR10001001", status: "RECEIVED_IN_LAB", collectedAt: new Date() },
    { tenantId: APOLLO_TENANT_ID, orderId: ORDER_IDS.ord1, barcode: "BAR10001002", status: "RECEIVED_IN_LAB", collectedAt: new Date() },
    { tenantId: APOLLO_TENANT_ID, orderId: ORDER_IDS.ord2, barcode: "BAR10001003", status: "IN_TRANSIT", collectedAt: new Date() },
    { tenantId: APOLLO_TENANT_ID, orderId: ORDER_IDS.ord4, barcode: "BAR10001004", status: "REJECTED", collectedAt: new Date() }
  ] as never);
  seedLog.count("Sample (Mongo)", 4);

  await LabResultModel.insertMany([
    { tenantId: APOLLO_TENANT_ID, orderId: ORDER_IDS.ord1, testCode: "CBC001", value: "14.5", unit: "g/dL", verifiedAt: new Date() },
    { tenantId: APOLLO_TENANT_ID, orderId: ORDER_IDS.ord1, testCode: "LIPID001", value: "240", unit: "mg/dL", verifiedAt: new Date() },
    { tenantId: APOLLO_TENANT_ID, orderId: ORDER_IDS.ord2, testCode: "HBA1C001", value: "9.8", unit: "%", verifiedAt: null }
  ] as never);
  seedLog.count("LabResult (Mongo)", 3);

  await ReagentBatchModel.insertMany([
    {
      tenantId: APOLLO_TENANT_ID,
      name: "Sysmex Cellpack Diluent",
      lotNumber: "LOT-98412",
      expiryDate: new Date("2027-12-31"),
      remainingTests: 420,
      reorderLevel: 100,
      instrumentCode: "SYSMEX-XN550"
    },
    {
      tenantId: APOLLO_TENANT_ID,
      name: "Roche Cobas Creatinine Enzymatic",
      lotNumber: "LOT-77120",
      expiryDate: new Date("2026-09-15"),
      remainingTests: 45,
      reorderLevel: 100,
      instrumentCode: "ROCHE-COBAS"
    }
  ] as never);
  seedLog.count("ReagentBatch (Mongo)", 2);

  const targetMean = 14.0;
  const targetSd = 0.3;
  const qcDocs = CONTROL_VALUES.map((observed, i) => {
    const zScore = (observed - targetMean) / targetSd;
    let status: "PASSED" | "WARNING" | "REJECTED" = "PASSED";
    let violatedRule: string | null = null;
    if (i === 13) {
      status = "WARNING";
      violatedRule = "1-2s";
    } else if (i === 14) {
      status = "REJECTED";
      violatedRule = "1-3s";
    }
    const runDate = new Date();
    runDate.setDate(runDate.getDate() - (14 - i));
    return {
      tenantId: APOLLO_TENANT_ID,
      instrumentName: "Sysmex XN-550 Hematology Analyzer",
      instrumentCode: "SYSMEX-XN550",
      controlLevel: "LEVEL_1_NORMAL",
      parameterName: "Hemoglobin",
      targetMean,
      targetSd,
      observedValue: observed,
      zScore,
      status,
      violatedRule,
      runDate
    };
  });
  await ControlSampleRunModel.insertMany(qcDocs as never);
  seedLog.count("ControlSampleRun (Mongo)", qcDocs.length);

  void users;
  void FRANCHISEE_ID;
  void REAGENT_SYSMEX_ID;
  void REAGENT_ROCHE_ID;
  void SAMPLE_IDS;
};
