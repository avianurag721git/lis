import { httpClient } from "../../services/http";

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

export type ControlLevel = "NORMAL" | "HIGH" | "LEVEL_1_NORMAL" | "LEVEL_2_HIGH" | "LEVEL_3_LOW";

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

export type PurchaseOrder = {
  id: string;
  poNumber: string;
  reagentId: string | null;
  reagentName: string;
  lotNumber: string | null;
  quantityVials: number;
  unitCostMinor: number;
  supplierName: string | null;
  status: string;
  notes: string | null;
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

type ApiOk<T> = { success: true; data: T };

export const inventoryApi = {
  async listReagents(): Promise<Reagent[]> {
    const { data } = await httpClient.get<ApiOk<{ reagents: Reagent[] }>>("/inventory/reagents");
    return data.data.reagents;
  },

  async createReagent(payload: {
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
    instrumentCode?: string | null;
  }): Promise<Reagent> {
    const { data } = await httpClient.post<ApiOk<{ reagent: Reagent }>>("/inventory/reagents", payload);
    return data.data.reagent;
  },

  async listPurchaseOrders(): Promise<PurchaseOrder[]> {
    const { data } = await httpClient.get<ApiOk<{ purchaseOrders: PurchaseOrder[] }>>(
      "/inventory/purchase-orders"
    );
    return data.data.purchaseOrders;
  },

  async createPurchaseOrder(payload: {
    reagentId?: string | null;
    reagentName: string;
    lotNumber?: string | null;
    quantityVials: number;
    unitCostMinor?: number;
    supplierName?: string | null;
    notes?: string | null;
  }): Promise<PurchaseOrder> {
    const { data } = await httpClient.post<ApiOk<{ purchaseOrder: PurchaseOrder }>>(
      "/inventory/purchase-orders",
      payload
    );
    return data.data.purchaseOrder;
  },

  async listControls(params?: {
    parameterName?: string;
    controlLevel?: string;
  }): Promise<ControlSampleResult[]> {
    const { data } = await httpClient.get<ApiOk<{ results: ControlSampleResult[] }>>("/inventory/qc/controls", {
      params
    });
    return data.data.results;
  },

  async recordControl(payload: {
    reagentId?: string | null;
    testId?: string | null;
    instrumentCode?: string | null;
    controlLevel: ControlLevel;
    parameterName: string;
    targetMean: number;
    targetSd: number;
    observedValue: number;
  }): Promise<{
    result: ControlSampleResult;
    hold: QcHold | null;
    evaluation: {
      flags: string[];
      isReject: boolean;
      zScore: number;
      rejectRules: string[];
      status: string;
      violatedRule: string | null;
      correctiveAction: string;
    };
    instrument: LabInstrument | null;
  }> {
    const { data } = await httpClient.post<
      ApiOk<{
        result: ControlSampleResult;
        hold: QcHold | null;
        evaluation: {
          flags: string[];
          isReject: boolean;
          zScore: number;
          rejectRules: string[];
          status: string;
          violatedRule: string | null;
          correctiveAction: string;
        };
        instrument: LabInstrument | null;
      }>
    >("/inventory/qc/controls", payload);
    return data.data;
  },

  async leveyJennings(
    parameterName: string,
    controlLevel: ControlLevel = "LEVEL_1_NORMAL"
  ): Promise<{ points: ControlSampleResult[]; bands: Record<string, number> | null }> {
    const { data } = await httpClient.get<
      ApiOk<{ chart: { points: ControlSampleResult[]; bands: Record<string, number> | null } }>
    >("/inventory/qc/levey-jennings", { params: { parameterName, controlLevel } });
    return data.data.chart;
  },

  async listHolds(): Promise<QcHold[]> {
    const { data } = await httpClient.get<ApiOk<{ holds: QcHold[] }>>("/inventory/qc/holds");
    return data.data.holds;
  },

  async resolveHold(holdId: string, calibrationPass = true): Promise<QcHold> {
    const { data } = await httpClient.post<ApiOk<{ hold: QcHold }>>(`/inventory/qc/holds/${holdId}/resolve`, {
      calibrationPass
    });
    return data.data.hold;
  },

  async listInstruments(): Promise<LabInstrument[]> {
    const { data } = await httpClient.get<ApiOk<{ instruments: LabInstrument[] }>>("/inventory/qc/instruments");
    return data.data.instruments;
  }
};
