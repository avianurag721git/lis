import mongoose, { Document, Schema } from "mongoose";
import { tenantScopePlugin } from "../plugins/tenantScope.plugin";

export type IReferralDoctor = Document & {
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
};

const referralDoctorSchema = new Schema<IReferralDoctor>(
  {
    doctorCode: { type: String, required: true },
    name: { type: String, required: true },
    clinicName: { type: String, default: null },
    specialization: { type: String, default: null },
    mobile: { type: String, default: null },
    whatsappNumber: { type: String, default: null },
    commissionPercentage: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
    usageCount: { type: Number, default: 0 }
  },
  { timestamps: true }
);

referralDoctorSchema.plugin(tenantScopePlugin);
referralDoctorSchema.index({ tenantId: 1, doctorCode: 1 }, { unique: true });

export const ReferralDoctorModel =
  mongoose.models.ReferralDoctor ?? mongoose.model<IReferralDoctor>("ReferralDoctor", referralDoctorSchema);
