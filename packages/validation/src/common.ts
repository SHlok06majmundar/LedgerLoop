import { z } from 'zod';

/** MongoDB ObjectId as a 24-character hex string. */
export const idSchema = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id');

/** Whole minor units; see docs/adr/0002. */
export const minorAmountSchema = z
  .number()
  .int('Amount must be in whole minor units')
  .nonnegative()
  .max(Number.MAX_SAFE_INTEGER);

export const positiveMinorAmountSchema = minorAmountSchema.refine((v) => v > 0, {
  message: 'Amount must be greater than zero',
});

/** Calendar date without time, e.g. 2026-10-31. */
export const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD');

export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(100).optional(),
  sort: z.string().max(50).optional(),
  order: z.enum(['asc', 'desc']).default('desc'),
});
export type PaginationQuery = z.infer<typeof paginationQuerySchema>;

export const dateRangeQuerySchema = z.object({
  from: isoDateSchema.optional(),
  to: isoDateSchema.optional(),
});
