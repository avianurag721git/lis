import { z } from "zod";

export const collectSampleSchema = z.object({
  body: z
    .object({
      sampleId: z.string().uuid().optional(),
      barcode: z.string().trim().min(3).optional()
    })
    .refine((b) => Boolean(b.sampleId || b.barcode), { message: "sampleId or barcode required" })
});

export const transitSampleSchema = z.object({
  body: z
    .object({
      sampleId: z.string().uuid().optional(),
      barcode: z.string().trim().min(3).optional(),
      temperatureCelsius: z.number()
    })
    .refine((b) => Boolean(b.sampleId || b.barcode), { message: "sampleId or barcode required" })
});

export const receiveSampleSchema = z.object({
  body: z.object({
    barcode: z.string().trim().min(3),
    accept: z.boolean().optional(),
    rejectionReason: z.string().trim().max(300).optional().nullable()
  })
});

export const rapidScanSchema = z.object({
  body: z.object({
    barcode: z.string().trim().min(3)
  })
});
