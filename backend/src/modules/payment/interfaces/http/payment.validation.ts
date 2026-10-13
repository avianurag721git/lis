import { z } from "zod";

const manualMethods = ["CASH", "UPI", "CARD"] as const;

export const addPaymentSchema = z.object({
  body: z.object({
    invoiceId: z.string().min(1),
    amount: z.number().positive(),
    method: z.enum(manualMethods),
    transactionReference: z.string().min(3).optional()
  })
});

export const createPaymentOrderSchema = z.object({
  body: z.object({
    invoiceId: z.string().min(1),
    amount: z.number().positive()
  })
});

export const verifyPaymentSchema = z.object({
  body: z.object({
    gatewayOrderId: z.string().min(3),
    paymentIntentId: z.string().min(3)
  })
});
