import { z } from "zod";

const testResultSchema = z.object({
  testName: z.string().min(1),
  value: z.string().min(1),
  referenceRange: z.string().min(1)
});

const parameterResultSchema = z.object({
  parameterId: z.string().min(1),
  value: z
    .union([z.string(), z.number()])
    .transform((v) => String(v).trim())
    .refine((v) => v.length > 0, { message: "value is required" })
});

export const generateReportSchema = z
  .object({
  body: z.object({
    patientId: z.string().min(1),
    patientName: z.string().min(1),
    patientPhone: z.string().min(8),
    pathologistName: z.string().min(2),
    templateType: z.enum(["STANDARD", "DETAILED"]).optional(),
    patientGender: z.enum(["MALE", "FEMALE", "OTHER"]).optional(),
    patientAgeYears: z.number().min(0).max(120).optional(),
    parameterResults: z.array(parameterResultSchema).min(1).optional(),
    // Backward-compatible mode: referenceRange is provided by the client.
    testResults: z.array(testResultSchema).min(1).optional()
  })
  })
  .refine(
    (payload) => {
      const b = payload.body;
      return (b.parameterResults?.length ?? 0) > 0 || (b.testResults?.length ?? 0) > 0;
    },
    { message: "Either parameterResults or testResults must be provided", path: ["body"] }
  )
  .refine(
    (payload) => {
      const b = payload.body;
      if ((b.parameterResults?.length ?? 0) > 0) {
        return b.patientGender != null && b.patientAgeYears != null;
      }
      return true;
    },
    { message: "patientGender and patientAgeYears are required when parameterResults is provided", path: ["body"] }
  );
