import { z } from "zod";

export const activeTemplateQuerySchema = z.object({
  query: z.object({
    patientGender: z.enum(["MALE", "FEMALE", "OTHER"]).optional(),
    patientAgeYears: z.coerce.number().min(0).max(120).optional()
  })
});

export const evaluateReportParametersSchema = z.object({
  body: z.object({
    templateType: z.enum(["STANDARD", "DETAILED"]).optional(),
    patientGender: z.enum(["MALE", "FEMALE", "OTHER"]),
    patientAgeYears: z.number().min(0).max(120),
    parameterValues: z
      .array(
        z.object({
          parameterId: z.string().min(1),
          value: z.union([z.string(), z.number()])
        })
      )
      .min(1)
  })
});

