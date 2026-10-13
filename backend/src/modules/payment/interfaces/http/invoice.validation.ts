import { z } from "zod";

export const createInvoiceBodySchema = z.object({
  body: z.object({
    patientId: z.string().trim().min(1),
    totalAmount: z.number().positive().max(500000)
  })
});
