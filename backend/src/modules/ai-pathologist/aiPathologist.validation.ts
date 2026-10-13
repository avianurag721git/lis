import { z } from "zod";

const testResultSchema = z.object({
  parameterName: z.string().trim().min(1),
  value: z.union([z.string(), z.number(), z.null()]).optional(),
  unit: z.string().nullable().optional(),
  referenceRange: z.string().trim().min(1),
  isAbnormal: z.boolean().default(false),
  isCritical: z.boolean().default(false),
  flag: z.string().nullable().optional()
});

export const analyzeResultSchema = z.object({
  body: z.object({
    patientAgeYears: z.number().int().min(0).max(130).nullable().optional(),
    patientGender: z.enum(["MALE", "FEMALE", "OTHER"]).nullable().optional(),
    testName: z.string().trim().max(200).optional(),
    departmentName: z.string().trim().max(120).optional(),
    testResults: z.array(testResultSchema).min(1).max(200)
  })
});

export const patientSummarySchema = z.object({
  body: z.object({
    language: z.enum(["en", "hi"]).default("en"),
    patientAgeYears: z.number().int().min(0).max(130).nullable().optional(),
    patientGender: z.enum(["MALE", "FEMALE", "OTHER"]).nullable().optional(),
    testName: z.string().trim().max(200).optional(),
    testResults: z.array(testResultSchema).min(1).max(200)
  })
});
