import { z } from "zod";

export const searchReferralDoctorsSchema = z.object({
  query: z.object({
    q: z.string().trim().max(120).optional().default("")
  })
});

export const quickAddReferralDoctorSchema = z.object({
  body: z.object({
    name: z.string().trim().min(2).max(120),
    mobile: z.string().trim().max(20).optional().nullable(),
    clinicName: z.string().trim().max(120).optional().nullable()
  })
});
