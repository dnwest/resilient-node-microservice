import { z } from "zod";

export const PaymentSchema = z.object({
  amount: z.number().positive("Amount must be positive"),
  currency: z.string().length(3, "Currency must be 3 characters (ISO 4217)"),
});

export const PaymentResponseSchema = z.object({
  success: z.boolean(),
  transactionId: z.string().optional(),
  reason: z.string().optional(),
});

export type Payment = z.infer<typeof PaymentSchema>;
export type PaymentResponse = z.infer<typeof PaymentResponseSchema>;
