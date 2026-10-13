import type { AgeUnit } from "../../common/age/patientAge";

export type PatientGender = "MALE" | "FEMALE" | "OTHER";
export type NationalIdType = "AADHAAR" | "SSN" | "PASSPORT" | "OTHER";
export type { AgeUnit };

export type Patient = {
  id: string;
  patientCode: string;
  uhid: string;
  name: string;
  phone: string | null;
  gender: PatientGender | null;
  dateOfBirth: string | null;
  ageValue: number | null;
  ageUnit: AgeUnit | null;
  ageDays: number | null;
  ageYears: number | null;
  ageDisplay: string | null;
  ageCompact: string | null;
  /** Masked national ID for UI (never full value in list APIs). */
  nationalIdMasked: string | null;
  nationalIdType: NationalIdType | null;
  /** Full decrypted ID — only populated for privileged getById. */
  nationalId?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type UpsertPatientInput = {
  name?: string;
  phone?: string | null;
  mobile?: string | null;
  gender?: PatientGender | null;
  dateOfBirth?: string | null;
  ageValue?: number | null;
  ageUnit?: AgeUnit | null;
  ageYears?: number | null;
  patientCode?: string;
  uhid?: string;
  nationalId?: string | null;
  nationalIdType?: NationalIdType | null;
};
