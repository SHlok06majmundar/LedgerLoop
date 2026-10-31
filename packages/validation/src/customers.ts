import { z } from 'zod';
import { minorAmountSchema, paginationQuerySchema } from './common';

/** Indian GST identification number, e.g. 27AAPFU0939F1ZV. */
const GSTIN = /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v === '' ? undefined : v));

export const addressSchema = z.object({
  line1: z.string().trim().max(200).default(''),
  line2: z.string().trim().max(200).default(''),
  city: z.string().trim().max(100).default(''),
  state: z.string().trim().max(100).default(''),
  postalCode: z.string().trim().max(20).default(''),
  country: z.string().trim().max(100).default('India'),
});
export type Address = z.infer<typeof addressSchema>;

export const createCustomerSchema = z.object({
  name: z.string().trim().min(2).max(200),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email()
    .optional()
    .or(z.literal('').transform(() => undefined)),
  phone: optionalText(30),
  gstin: z
    .string()
    .trim()
    .toUpperCase()
    .regex(GSTIN, 'Invalid GSTIN')
    .optional()
    .or(z.literal('').transform(() => undefined)),
  billingAddress: addressSchema.optional(),
  shippingAddress: addressSchema.optional(),
  creditLimitMinor: minorAmountSchema.optional(),
  paymentTermsDays: z.number().int().min(0).max(365).default(30),
  notes: optionalText(2000),
  remindersEnabled: z.boolean().default(true),
});
export type CreateCustomerInput = z.infer<typeof createCustomerSchema>;

export const updateCustomerSchema = createCustomerSchema.partial();
export type UpdateCustomerInput = z.infer<typeof updateCustomerSchema>;

export const listCustomersQuerySchema = paginationQuerySchema.extend({
  status: z.enum(['active', 'archived', 'all']).default('active'),
});
export type ListCustomersQuery = z.infer<typeof listCustomersQuerySchema>;
