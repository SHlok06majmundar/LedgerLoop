import { z } from 'zod';

const role = z.enum(['OWNER', 'ADMIN', 'ACCOUNTANT', 'MANAGER', 'STAFF', 'VIEWER']);
const invitableRole = role.exclude(['OWNER']);

export const createOrganizationSchema = z.object({
  name: z.string().trim().min(2).max(100),
  currency: z.string().length(3).toUpperCase().default('INR'),
  timezone: z.string().min(1).max(64).default('Asia/Kolkata'),
});
export type CreateOrganizationInput = z.infer<typeof createOrganizationSchema>;

export const updateOrganizationSchema = createOrganizationSchema.partial().extend({
  email: z.string().trim().toLowerCase().email().optional().or(z.literal('')),
  phone: z.string().trim().max(30).optional(),
  gstin: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/, 'Invalid GSTIN')
    .optional()
    .or(z.literal('')),
  address: z.string().trim().max(500).optional(),
});
export type UpdateOrganizationInput = z.infer<typeof updateOrganizationSchema>;

export const createInvitationSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  role: invitableRole,
});
export type CreateInvitationInput = z.infer<typeof createInvitationSchema>;

export const acceptInvitationSchema = z.object({
  token: z.string().min(20).max(200),
});
export type AcceptInvitationInput = z.infer<typeof acceptInvitationSchema>;

export const updateMemberSchema = z
  .object({
    role: invitableRole.optional(),
    status: z.enum(['ACTIVE', 'DISABLED']).optional(),
  })
  .refine((v) => v.role !== undefined || v.status !== undefined, {
    message: 'Provide a role or status',
  });
export type UpdateMemberInput = z.infer<typeof updateMemberSchema>;
