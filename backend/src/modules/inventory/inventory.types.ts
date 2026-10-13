export type Reagent = {
  id: string;
  name: string;
  lotNumber: string;
  expiryDate: string;
  vialCapacity: number;
  testsPerVial: number;
  remainingTests: number;
  reorderLevel: number;
  unitCostMinor: number;
  supplierName: string | null;
  branchId: string | null;
  testId: string | null;
  departmentId: string | null;
  instrumentCode: string | null;
  isActive: boolean;
  lowStockAlertedAt: string | null;
};

export type ControlLevel =
  | "NORMAL"
  | "HIGH"
  | "LEVEL_1_NORMAL"
  | "LEVEL_2_HIGH"
  | "LEVEL_3_LOW";

export type ControlSampleResult = {
  id: string;
  reagentId: string | null;
  testId: string | null;
  instrumentCode: string | null;
  controlLevel: ControlLevel;
  parameterName: string;
  targetMean: number;
  targetSd: number;
  observedValue: number;
  runDate: string;
  zScore: number | null;
  westgardFlags: string[];
  isReject: boolean;
  status: "PASSED" | "WARNING" | "REJECTED";
  violatedRule: string | null;
};

export type QcHold = {
  id: string;
  reason: string;
  westgardRule: string;
  reagentId: string | null;
  testId: string | null;
  instrumentCode: string | null;
  isActive: boolean;
  createdAt: string;
};

export type LabInstrument = {
  id: string;
  code: string;
  name: string | null;
  status: "IN_CALIBRATION" | "OUT_OF_CALIBRATION";
  outOfCalibrationReason: string | null;
  lastCalibrationAt: string | null;
};

export type PurchaseOrder = {
  id: string;
  poNumber: string;
  reagentId: string | null;
  reagentName: string;
  lotNumber: string | null;
  quantityVials: number;
  unitCostMinor: number;
  supplierName: string | null;
  status: "DRAFT" | "SUBMITTED" | "RECEIVED" | "CANCELLED";
  notes: string | null;
  createdAt: string;
};

export type CreateReagentInput = {
  name: string;
  lotNumber: string;
  expiryDate: string;
  vialCapacity: number;
  testsPerVial?: number;
  remainingTests?: number;
  reorderLevel?: number;
  unitCostMinor?: number;
  supplierName?: string | null;
  branchId?: string | null;
  testId?: string | null;
  departmentId?: string | null;
  instrumentCode?: string | null;
};

export type CreateControlInput = {
  reagentId?: string | null;
  testId?: string | null;
  instrumentCode?: string | null;
  controlLevel: ControlLevel;
  parameterName: string;
  targetMean: number;
  targetSd: number;
  observedValue: number;
  runDate?: string;
};

export type CreatePurchaseOrderInput = {
  reagentId?: string | null;
  reagentName: string;
  lotNumber?: string | null;
  quantityVials: number;
  unitCostMinor?: number;
  supplierName?: string | null;
  notes?: string | null;
};
