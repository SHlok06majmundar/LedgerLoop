import { z } from 'zod';
import {
  dateRangeQuerySchema,
  idSchema,
  isoDateSchema,
  minorAmountSchema,
  paginationQuerySchema,
} from './common';

export const invoiceItemSchema = z.object({
  description: z.string().trim().min(1).max(500),
  /** Thousandths of a unit: 2.5 kg is 2500. */
  quantityMilli: z.number().int().positive().max(1_000_000_000_000),
  unitPriceMinor: minorAmountSchema,
  /** Basis points: 18% is 1800. */
  taxRateBps: z.number().int().min(0).max(10_000).default(0),
  discountMinor: minorAmountSchema.default(0),
});
export type InvoiceItemInput = z.infer<typeof invoiceItemSchema>;

const invoiceFields = {
  customerId: idSchema,
  issueDate: isoDateSchema,
  /** Defaults to issue date plus the customer's payment terms. */
  dueDate: isoDateSchema.optional(),
  items: z.array(invoiceItemSchema).min(1, 'Add at least one line item').max(200),
  notes: z.string().trim().max(2000).optional(),
  terms: z.string().trim().max(2000).optional(),
};

const dueAfterIssue = (v: { issueDate?: string; dueDate?: string }) =>
  !v.issueDate || !v.dueDate || v.dueDate >= v.issueDate;
const dueAfterIssueMessage = {
  message: 'Due date cannot be before the issue date',
  path: ['dueDate'],
};

export const createInvoiceSchema = z
  .object(invoiceFields)
  .refine(dueAfterIssue, dueAfterIssueMessage);
export type CreateInvoiceInput = z.infer<typeof createInvoiceSchema>;

export const updateInvoiceSchema = z
  .object(invoiceFields)
  .partial()
  .refine(dueAfterIssue, dueAfterIssueMessage);
export type UpdateInvoiceInput = z.infer<typeof updateInvoiceSchema>;

export const voidInvoiceSchema = z.object({
  reason: z.string().trim().min(3).max(500),
});
export type VoidInvoiceInput = z.infer<typeof voidInvoiceSchema>;

export const sendInvoiceSchema = z.object({
  to: z.string().trim().toLowerCase().email().optional(),
  message: z.string().trim().max(2000).optional(),
});
export type SendInvoiceInput = z.infer<typeof sendInvoiceSchema>;

export const listInvoicesQuerySchema = paginationQuerySchema.merge(dateRangeQuerySchema).extend({
  status: z
    .enum(['DRAFT', 'ISSUED', 'PARTIALLY_PAID', 'PAID', 'OVERDUE', 'VOID', 'OPEN'])
    .optional(),
  customerId: idSchema.optional(),
});
export type ListInvoicesQuery = z.infer<typeof listInvoicesQuerySchema>;
