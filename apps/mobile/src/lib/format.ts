import { formatMinor } from '@ledgerloop/shared-types';

export const money = (minor: number | null | undefined, currency = 'INR') =>
  formatMinor(minor ?? 0, currency);

/** "2,500.50" → 250050 minor units without floating point. */
export function parseMoneyInput(value: string): number | null {
  const match = value.replace(/[₹,\s]/g, '').match(/^(\d+)(?:\.(\d{0,2}))?$/);
  if (!match) return null;
  const minor = Number(match[1]) * 100 + Number((match[2] ?? '').padEnd(2, '0'));
  return Number.isSafeInteger(minor) ? minor : null;
}

export function date(value: string | null | undefined): string {
  if (!value) return '—';
  const d = value.length === 10 ? new Date(`${value}T00:00:00Z`) : new Date(value);
  return d.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: value.length === 10 ? 'UTC' : undefined,
  });
}

export const humanize = (value: string) =>
  value.toLowerCase().replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());

export function todayISO(): string {
  const d = new Date(Date.now() + 330 * 60_000);
  return d.toISOString().slice(0, 10);
}
