import { z } from "zod";

export const bookOrderSchema = z.object({
  body: z.object({
    patientId: z.string().uuid().optional(),
    patient: z
      .object({
        name: z.string().trim().min(1).max(120).optional(),
        mobile: z.string().trim().min(6).max(30).optional(),
        phone: z.string().trim().min(6).max(30).optional(),
        uhid: z.string().trim().min(1).max(40).optional(),
        gender: z.enum(["MALE", "FEMALE", "OTHER"]).optional().nullable(),
        dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
        ageValue: z.number().int().min(0).max(43800).optional().nullable(),
        ageUnit: z.enum(["DAYS", "MONTHS", "YEARS"]).optional().nullable(),
        ageYears: z.number().int().min(0).max(120).optional().nullable()
      })
      .optional(),
    collectionType: z.enum(["WALK_IN", "HOME_COLLECTION", "B2B_FRANCHISEE"]),
    franchiseeId: z.string().trim().max(80).optional().nullable(),
    referredDoctor: z.string().trim().max(120).optional().nullable(),
    referralDoctorId: z.string().uuid().optional().nullable(),
    discountMinor: z.number().int().min(0).optional(),
    taxRatePercent: z.number().min(0).max(40).optional(),
    items: z
      .array(
        z.object({
          itemType: z.enum(["TEST", "PACKAGE"]),
          testId: z.string().uuid().optional(),
          packageId: z.string().uuid().optional(),
          quantity: z.number().int().min(1).max(20).optional()
        })
      )
      .min(1)
  })
});
