import { z } from 'zod';
import {
  dateRangeQuerySchema,
  idSchema,
  isoDateSchema,
  paginationQuerySchema,
  positiveMinorAmountSchema,
} from './common';

export const paymentMethodSchema = z.enum([
  'UPI',
  'NEFT',
  'RTGS',
  'IMPS',
  'BANK_TRANSFER',
  'CASH',
  'CHEQUE',
]);

export const allocationLineSchema = z.object({
  invoiceId: idSchema,
  amountMinor: positiveMinorAmountSchema,
});
export type AllocationLine = z.infer<typeof allocationLineSchema>;

const allocationList = z
  .array(allocationLineSchema)
  .min(1)
  .max(100)
  .refine((lines) => new Set(lines.map((l) => l.invoiceId)).size === lines.length, {
    message: 'Each invoice can appear only once',
  });

export const createPaymentSchema = z.object({
  customerId: idSchema,
  amountMinor: positiveMinorAmountSchema,
  method: paymentMethodSchema,
  /** UTR, cheque number or other external reference; used for duplicate detection. */
  reference: z
    .string()
    .trim()
    .max(100)
    .optional()
    .transform((v) => (v ? v.toUpperCase() : undefined)),
  paymentDate: isoDateSchema,
  notes: z.string().trim().max(2000).optional(),
  allocations: allocationList.optional(),
});
export type CreatePaymentInput = z.infer<typeof createPaymentSchema>;

/** Corrects how a payment is described; the amount and customer change only by reversal. */
export const updatePaymentSchema = createPaymentSchema
  .pick({ method: true, reference: true, paymentDate: true, notes: true })
  .partial()
  .strict();
export type UpdatePaymentInput = z.infer<typeof updatePaymentSchema>;

export const allocatePaymentSchema = z.object({ allocations: allocationList });
export type AllocatePaymentInput = z.infer<typeof allocatePaymentSchema>;

export const reversePaymentSchema = z.object({
  /** Reverse one allocation; omit to reverse the whole payment and all its allocations. */
  allocationId: idSchema.optional(),
  reason: z.string().trim().min(3).max(500),
});
export type ReversePaymentInput = z.infer<typeof reversePaymentSchema>;

export const listPaymentsQuerySchema = paginationQuerySchema.merge(dateRangeQuerySchema).extend({
  customerId: idSchema.optional(),
  method: paymentMethodSchema.optional(),
  status: z.enum(['POSTED', 'REVERSED']).optional(),
  allocation: z.enum(['unallocated', 'partial', 'full']).optional(),
});
export type ListPaymentsQuery = z.infer<typeof listPaymentsQuerySchema>;
