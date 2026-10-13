import { httpClient } from "../../services/http";

export type ReferralDoctorRow = {
  referredDoctor: string;
  month: string;
  orderCount: number;
  patientCount: number;
  netRevenueMinor: number;
  departments: Array<{ departmentName: string; orderCount: number; revenueMinor: number }>;
};

type ApiOk<T> = { success: true; data: T };

export const referralAnalyticsApi = {
  async byDoctor(params?: { from?: string; to?: string; doctor?: string }): Promise<{
    rows: ReferralDoctorRow[];
    totals: { orderCount: number; netRevenueMinor: number };
  }> {
    const { data } = await httpClient.get<
      ApiOk<{ rows: ReferralDoctorRow[]; totals: { orderCount: number; netRevenueMinor: number } }>
    >("/analytics/referral-doctors", { params: params ?? {} });
    return data.data;
  }
};
