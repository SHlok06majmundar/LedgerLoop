import { InvoiceStatus } from '@ledgerloop/shared-types';

export interface InvoiceBalance {
  status: InvoiceStatus;
  totalMinor: number;
  allocatedMinor: number;
  /** Calendar date, YYYY-MM-DD. */
  dueDate: string;
}

/**
 * Status of a posted invoice follows from its money and due date:
 * PAID > OVERDUE > PARTIALLY_PAID > ISSUED. Drafts and voids are explicit.
 */
export function deriveStatus(invoice: InvoiceBalance, today: string): InvoiceStatus {
  if (invoice.status === InvoiceStatus.DRAFT || invoice.status === InvoiceStatus.VOID) {
    return invoice.status;
  }
  if (invoice.allocatedMinor >= invoice.totalMinor) return InvoiceStatus.PAID;
  if (today > invoice.dueDate) return InvoiceStatus.OVERDUE;
  if (invoice.allocatedMinor > 0) return InvoiceStatus.PARTIALLY_PAID;
  return InvoiceStatus.ISSUED;
}

/** Today's calendar date in an IANA timezone. */
export function todayIn(timezone: string, now: Date = new Date()): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Whole days from `from` to `to` (positive when `to` is later). */
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}
