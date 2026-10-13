import { httpClient } from "../../services/http";

export type ReferralDoctor = {
  id: string;
  tenantId: string;
  doctorCode: string;
  name: string;
  clinicName: string | null;
  specialization: string | null;
  mobile: string | null;
  whatsappNumber: string | null;
  commissionPercentage: number;
  isActive: boolean;
  usageCount: number;
  createdAt: string;
};

export const SELF_DOCTOR_CODE = "DOC-000";

type ApiOk<T> = { success: true; data: T };

export const referralDoctorsApi = {
  async search(q: string): Promise<ReferralDoctor[]> {
    const { data } = await httpClient.get<ApiOk<{ doctors: ReferralDoctor[] }>>("/referral-doctors/search", {
      params: { q }
    });
    return data.data.doctors;
  },

  async frequent(): Promise<ReferralDoctor[]> {
    const { data } = await httpClient.get<ApiOk<{ doctors: ReferralDoctor[] }>>("/referral-doctors/frequent");
    return data.data.doctors;
  },

  async quickAdd(input: { name: string; mobile?: string; clinicName?: string }): Promise<ReferralDoctor> {
    const { data } = await httpClient.post<ApiOk<{ doctor: ReferralDoctor }>>("/referral-doctors/quick-add", input);
    return data.data.doctor;
  }
};
