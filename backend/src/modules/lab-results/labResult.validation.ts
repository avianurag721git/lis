import { z } from "zod";

export const pendingQuerySchema = z.object({
  query: z.object({
    department: z.string().optional(),
    orderId: z.string().uuid().optional()
  })
});

export const saveDraftSchema = z.object({
  body: z.object({
    labResultId: z.string().uuid(),
    technicianNote: z.string().max(1000).optional().nullable(),
    entries: z
      .array(
        z.object({
          parameterId: z.string().uuid(),
          value: z.number().nullable().optional(),
          valueText: z.string().max(120).nullable().optional(),
          criticalAckNote: z.string().max(500).nullable().optional()
        })
      )
      .min(1)
  })
});

export const batchVerifySchema = z.object({
  body: z.object({
    labResultIds: z.array(z.string().uuid()).min(1),
    digitalSignatureUrl: z.string().min(1).max(2000).optional().nullable(),
    medicalLicenseNumber: z.string().min(2).max(80).optional().nullable(),
    pathologistName: z.string().min(2).max(120).optional().nullable()
  })
});

export const rerunSchema = z.object({
  body: z.object({
    labResultId: z.string().uuid(),
    instructions: z.string().trim().min(3).max(2000)
  })
});

export const pathologistProfileSchema = z.object({
  body: z.object({
    fullName: z.string().trim().min(2).max(120),
    medicalLicenseNumber: z.string().trim().min(2).max(80),
    digitalSignatureUrl: z.string().min(1).max(2000).optional().nullable()
  })
});
