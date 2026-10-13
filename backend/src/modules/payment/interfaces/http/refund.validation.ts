import { z } from "zod";

export const createRefundBodySchema = z.object({
  body: z.object({
    transactionId: z.string().uuid(),
    amount: z.number().positive(),
    reason: z.string().trim().max(2000).optional()
  })
});
