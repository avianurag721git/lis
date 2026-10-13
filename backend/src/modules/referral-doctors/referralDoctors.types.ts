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
export const SELF_DOCTOR_NAME = "Self / Direct";
