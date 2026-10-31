import { daysBetween } from '../../invoices/domain/invoice-status';

export type ReminderStepKind = 'UPCOMING' | 'DUE_TODAY' | 'OVERDUE' | 'ESCALATION';

export interface ReminderRule {
  /** Days relative to the due date: -3 is three days before, 7 is a week late. */
  offsetDays: number;
  kind: ReminderStepKind;
}

/** The product spec's default schedule. */
export const DEFAULT_RULES: ReminderRule[] = [
  { offsetDays: -3, kind: 'UPCOMING' },
  { offsetDays: 0, kind: 'DUE_TODAY' },
  { offsetDays: 3, kind: 'OVERDUE' },
  { offsetDays: 7, kind: 'OVERDUE' },
  { offsetDays: 15, kind: 'ESCALATION' },
];

/**
 * The latest step an invoice has reached today. Each step is sent at most
 * once (see `reminderKey`); steps missed while the scheduler was down are
 * skipped rather than sent late in a burst.
 */
export function dueReminderStep(
  invoice: { dueDate: string },
  rules: ReminderRule[],
  today: string,
): ReminderRule | null {
  const daysPastDue = daysBetween(invoice.dueDate, today);
  const reached = rules
    .filter((r) => r.offsetDays <= daysPastDue)
    .sort((a, b) => b.offsetDays - a.offsetDays);
  return reached[0] ? { offsetDays: reached[0].offsetDays, kind: reached[0].kind } : null;
}

export function reminderKey(invoiceId: string, rule: ReminderRule): string {
  return `${invoiceId}:${rule.kind}:${rule.offsetDays}`;
}
