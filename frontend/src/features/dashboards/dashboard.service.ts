import { httpClient } from "../../services/http";

export type ExecutiveSummary = {
  revenue: {
    dailyMinor: number;
    weeklyMinor: number;
    monthlyMinor: number;
    aovMinor: number;
    orderCount: number;
  };
  byCollectionType: Array<{ collectionType: string; revenueMinor: number; orderCount: number }>;
  byBranch: Array<{ branch: string; revenueMinor: number; orderCount: number }>;
  topTests: Array<{ name: string; orderCount: number; revenueMinor: number }>;
  topPackages: Array<{ name: string; orderCount: number; revenueMinor: number }>;
  patientCount: number;
  activeSamples: number;
  generatedAt: string;
};

export type TatMetrics = {
  slaHours: number;
  completedCount: number;
  withinSlaCount: number;
  breachedCount: number;
  withinSlaPercent: number;
  avgTatHours: number | null;
  medianTatHours: number | null;
  byDepartment: Array<{ departmentName: string; avgTatHours: number; count: number }>;
};

export type SampleRejectionMetrics = {
  totalSamples: number;
  rejectedCount: number;
  rejectionRatePercent: number;
  byReason: Array<{ reason: string; count: number; percent: number }>;
};

export type LivePipeline = {
  stages: Array<{ stage: string; count: number }>;
  criticalAlerts: Array<{
    labResultId: string;
    orderNumber: string;
    patientName: string;
    parameterName: string;
    value: number | null;
    flaggedAt: string;
  }>;
  phlebotomists: Array<{
    userId: string;
    activeCollections: number;
    lastCollectedAt: string | null;
  }>;
  generatedAt: string;
};

type ApiOk<T> = { success: true; data: T };

export const lisDashboardApi = {
  async executiveSummary(): Promise<ExecutiveSummary> {
    const { data } = await httpClient.get<ApiOk<ExecutiveSummary>>("/analytics/executive-summary");
    return data.data;
  },
  async tatMetrics(): Promise<TatMetrics> {
    const { data } = await httpClient.get<ApiOk<TatMetrics>>("/analytics/tat-metrics");
    return data.data;
  },
  async sampleRejections(): Promise<SampleRejectionMetrics> {
    const { data } = await httpClient.get<ApiOk<SampleRejectionMetrics>>("/analytics/sample-rejections");
    return data.data;
  },
  async livePipeline(): Promise<LivePipeline> {
    const { data } = await httpClient.get<ApiOk<LivePipeline>>("/analytics/live-pipeline");
    return data.data;
  }
};

export const money = (minor: number): string =>
  new Intl.NumberFormat(undefined, { style: "currency", currency: "INR" }).format(minor / 100);
