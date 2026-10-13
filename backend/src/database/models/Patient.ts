import mongoose, { Document, Schema } from "mongoose";
import { tenantScopePlugin } from "../plugins/tenantScope.plugin";

export type IPatient = Document & {
  tenantId: string;
  patientCode: string;
  uhid: string;
  name: string;
  phone: string | null;
  gender: string | null;
  ageYears: number | null;
};

const patientSchema = new Schema<IPatient>(
  {
    patientCode: { type: String, required: true },
    uhid: { type: String, required: true },
    name: { type: String, required: true },
    phone: { type: String, default: null },
    gender: { type: String, default: null },
    ageYears: { type: Number, default: null }
  },
  { timestamps: true }
);

patientSchema.plugin(tenantScopePlugin);
patientSchema.index({ tenantId: 1, patientCode: 1 }, { unique: true });

export const PatientModel = mongoose.models.Patient ?? mongoose.model<IPatient>("Patient", patientSchema);
