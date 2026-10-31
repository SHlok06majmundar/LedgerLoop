import { z } from 'zod';
import { idSchema, paginationQuerySchema } from './common';

export const reminderRuleSchema = z.object({
  offsetDays: z.number().int().min(-60).max(365),
  kind: z.enum(['UPCOMING', 'DUE_TODAY', 'OVERDUE', 'ESCALATION']),
});

export const collectionSettingsSchema = z.object({
  enabled: z.boolean(),
  /** Local hour (organization timezone) after which automated reminders go out. */
  sendHour: z.number().int().min(0).max(23),
  rules: z
    .array(reminderRuleSchema)
    .max(10)
    .refine((rules) => new Set(rules.map((r) => r.offsetDays)).size === rules.length, {
      message: 'Each step needs a different day',
    }),
});
export type CollectionSettingsInput = z.infer<typeof collectionSettingsSchema>;

export const createReminderSchema = z.object({
  invoiceIds: z.array(idSchema).min(1).max(20),
  message: z.string().trim().max(2000).optional(),
  /** ISO date-time; omit to send now. */
  scheduledAt: z.string().datetime({ offset: true }).optional(),
});
export type CreateReminderInput = z.infer<typeof createReminderSchema>;

export const updateReminderSchema = z
  .object({
    scheduledAt: z.string().datetime({ offset: true }).optional(),
    status: z.literal('CANCELLED').optional(),
  })
  .refine((v) => v.scheduledAt !== undefined || v.status !== undefined, {
    message: 'Provide a new time or cancel the reminder',
  });
export type UpdateReminderInput = z.infer<typeof updateReminderSchema>;

export const listRemindersQuerySchema = paginationQuerySchema.extend({
  status: z.enum(['SCHEDULED', 'SENT', 'FAILED', 'CANCELLED']).optional(),
  customerId: idSchema.optional(),
});
export type ListRemindersQuery = z.infer<typeof listRemindersQuerySchema>;
