import { z } from 'zod';
import { idSchema, paginationQuerySchema, positiveMinorAmountSchema } from './common';

export const rejectMatchSchema = z.object({
  reason: z.string().trim().min(3).max(500),
});
export type RejectMatchInput = z.infer<typeof rejectMatchSchema>;

/** Link a bank line to an existing payment, or create a payment allocated to invoices. */
export const manualMatchSchema = z
  .object({
    paymentId: idSchema.optional(),
    customerId: idSchema.optional(),
    allocations: z
      .array(z.object({ invoiceId: idSchema, amountMinor: positiveMinorAmountSchema }))
      .max(50)
      .optional(),
    /** Required to link a payment whose amount differs from the bank line. */
    acceptDiscrepancy: z.boolean().default(false),
    note: z.string().trim().max(500).optional(),
  })
  .refine((v) => Boolean(v.paymentId) !== Boolean(v.customerId), {
    message: 'Provide either paymentId or customerId',
    path: ['paymentId'],
  });
export type ManualMatchInput = z.infer<typeof manualMatchSchema>;

export const listMatchesQuerySchema = paginationQuerySchema.extend({
  status: z
    .enum(['SUGGESTED', 'MATCHED', 'PARTIALLY_MATCHED', 'DISCREPANCY', 'REJECTED'])
    .optional(),
  runId: idSchema.optional(),
  bankTransactionId: idSchema.optional(),
});
export type ListMatchesQuery = z.infer<typeof listMatchesQuerySchema>;

export const listExceptionsQuerySchema = paginationQuerySchema.extend({
  status: z.enum(['OPEN', 'RESOLVED']).default('OPEN'),
  assigneeId: idSchema.optional(),
  reason: z.enum(['UNMATCHED', 'SUGGESTED', 'PARTIALLY_MATCHED', 'DISCREPANCY']).optional(),
});
export type ListExceptionsQuery = z.infer<typeof listExceptionsQuerySchema>;

export const updateExceptionSchema = z
  .object({
    assigneeId: idSchema.nullable().optional(),
    comment: z.string().trim().min(1).max(2000).optional(),
  })
  .refine((v) => v.assigneeId !== undefined || v.comment !== undefined, {
    message: 'Provide an assignee or a comment',
  });
export type UpdateExceptionInput = z.infer<typeof updateExceptionSchema>;

export const ignoreExceptionSchema = z.object({
  reason: z.string().trim().min(3).max(500),
});
export type IgnoreExceptionInput = z.infer<typeof ignoreExceptionSchema>;
