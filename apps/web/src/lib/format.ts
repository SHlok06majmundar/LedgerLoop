import { formatMinor } from '@ledgerloop/shared-types';

/** ₹2,36,000.00 from minor units. Display only: never parse back. */
export const money = (minor: number | null | undefined, currency = 'INR') =>
  formatMinor(minor ?? 0, currency);

/** ₹2.4L / ₹1.2Cr style for compact KPI tiles. */
export function compactMoney(minor: number, currency = 'INR'): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency,
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(minor / 100);
}

/** "2,500.50" (user input) → 250050 minor units, or null. String-based: no floats. */
export function parseMoneyInput(value: string): number | null {
  const text = value.replace(/[₹,\s]/g, '');
  const match = text.match(/^(\d+)(?:\.(\d{0,2}))?$/);
  if (!match) return null;
  const minor = Number(match[1]) * 100 + Number((match[2] ?? '').padEnd(2, '0'));
  return Number.isSafeInteger(minor) ? minor : null;
}

/** 250050 → "2500.50" for editing in an input. */
export const minorToInput = (minor: number) =>
  `${Math.trunc(minor / 100)}.${String(minor % 100).padStart(2, '0')}`;

/** "2.5" → 2500 thousandths. */
export function parseQuantityInput(value: string): number | null {
  const match = value.trim().match(/^(\d+)(?:\.(\d{0,3}))?$/);
  if (!match) return null;
  return Number(match[1]) * 1000 + Number((match[2] ?? '').padEnd(3, '0'));
}

export const quantityToInput = (milli: number) =>
  milli % 1000 === 0 ? String(milli / 1000) : (milli / 1000).toFixed(3).replace(/0+$/, '');

/** 31 Oct 2026 from YYYY-MM-DD or an ISO timestamp. */
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

export function dateTime(value: string | null | undefined): string {
  if (!value) return '—';
  return new Date(value).toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function relativeTime(value: string): string {
  const seconds = Math.round((new Date(value).getTime() - Date.now()) / 1000);
  const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ['day', 86_400],
    ['hour', 3600],
    ['minute', 60],
  ];
  for (const [unit, size] of units) {
    if (Math.abs(seconds) >= size) return rtf.format(Math.round(seconds / size), unit);
  }
  return 'just now';
}

export const percentFromBps = (bps: number) => `${(bps / 100).toFixed(1)}%`;

export function todayISO(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
}

export const humanize = (value: string) =>
  value.toLowerCase().replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
