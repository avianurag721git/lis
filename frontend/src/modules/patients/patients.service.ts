import { httpClient } from "../../services/http";
import type { AgeUnit } from "../../utils/patientAge";

export type PatientGender = "MALE" | "FEMALE" | "OTHER";
export type { AgeUnit };

export type PatientAgePayload = {
  dateOfBirth?: string | null;
  ageValue?: number | null;
  ageUnit?: AgeUnit | null;
  ageYears?: number | null;
};

export type Patient = {
  id: string;
  patientCode: string;
  uhid?: string;
  name: string;
  phone: string | null;
  gender: PatientGender | null;
  dateOfBirth?: string | null;
  ageValue?: number | null;
  ageUnit?: AgeUnit | null;
  ageDays?: number | null;
  ageYears: number | null;
  ageDisplay?: string | null;
  ageCompact?: string | null;
  createdAt: string;
  updatedAt: string;
};

type ApiOk<T> = { success: true; data: T };

const unwrapPatients = (payload: any): Patient[] => {
  if (Array.isArray(payload?.data?.patients)) return payload.data.patients;
  if (Array.isArray(payload?.patients)) return payload.patients;
  return [];
};

export const patientsApi = {
  async list(q?: string): Promise<Patient[]> {
    const { data } = await httpClient.get("/patients", { params: q ? { q } : {} });
    return unwrapPatients(data);
  },

  async createOrSearch(
    input: {
      patientCode?: string;
      uhid?: string;
      name?: string;
      phone?: string | null;
      mobile?: string | null;
      gender?: PatientGender | null;
    } & PatientAgePayload
  ): Promise<{ patient: Patient; created: boolean }> {
    const { data } = await httpClient.post<ApiOk<{ patient: Patient; created: boolean }>>("/patients", input);
    return data.data;
  },

  async create(
    input: {
      patientCode: string;
      name: string;
      phone?: string | null;
      gender?: PatientGender | null;
    } & PatientAgePayload
  ): Promise<Patient> {
    const result = await this.createOrSearch({
      patientCode: input.patientCode,
      uhid: input.patientCode,
      name: input.name,
      phone: input.phone ?? null,
      gender: input.gender ?? null,
      dateOfBirth: input.dateOfBirth ?? null,
      ageValue: input.ageValue ?? null,
      ageUnit: input.ageUnit ?? null,
      ageYears: input.ageYears ?? null
    });
    return result.patient;
  },

  async update(
    patientId: string,
    patch: {
      patientCode?: string;
      name?: string;
      phone?: string | null;
      gender?: PatientGender | null;
    } & PatientAgePayload
  ): Promise<Patient> {
    const { data } = await httpClient.put<ApiOk<{ patient: Patient }> | { patient: Patient }>(`/patients/${patientId}`, patch);
    const anyData = data as any;
    return anyData?.data?.patient ?? anyData.patient;
  }
};
