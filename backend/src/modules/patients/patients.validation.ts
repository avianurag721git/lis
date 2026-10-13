import { z } from "zod";

export const ageUnitSchema = z.enum(["DAYS", "MONTHS", "YEARS"]);

export const patientAgeBodyFields = {
  dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  ageValue: z.number().int().min(0).max(43800).optional().nullable(),
  ageUnit: ageUnitSchema.optional().nullable(),
  ageYears: z.number().int().min(0).max(120).optional().nullable()
};

export const patientIdParams = z.object({
  params: z.object({
    patientId: z.string().uuid()
  })
});

export const listPatientsQuery = z.object({
  query: z.object({
    q: z.string().optional()
  })
});

const gender = z.enum(["MALE", "FEMALE", "OTHER"]);

export const createPatientSchema = z.object({
  body: z.object({
    patientCode: z.string().trim().min(1).max(40).optional(),
    uhid: z.string().trim().min(1).max(40).optional(),
    name: z.string().trim().min(1).max(120).optional(),
    phone: z.string().trim().min(6).max(30).optional().nullable(),
    mobile: z.string().trim().min(6).max(30).optional().nullable(),
    gender: gender.optional().nullable(),
    ...patientAgeBodyFields,
    nationalId: z.string().trim().min(4).max(40).optional().nullable(),
    nationalIdType: z.enum(["AADHAAR", "SSN", "PASSPORT", "OTHER"]).optional().nullable()
  })
});

export const updatePatientSchema = z.object({
  body: z.object({
    patientCode: z.string().trim().min(1).max(40).optional(),
    name: z.string().trim().min(1).max(120).optional(),
    phone: z.string().trim().min(6).max(30).optional().nullable(),
    gender: gender.optional().nullable(),
    ...patientAgeBodyFields,
    nationalId: z.string().trim().min(4).max(40).optional().nullable(),
    nationalIdType: z.enum(["AADHAAR", "SSN", "PASSPORT", "OTHER"]).optional().nullable()
  })
});
