export const AGING_BUCKETS = [
  'NOT_DUE',
  'DAYS_1_30',
  'DAYS_31_60',
  'DAYS_61_90',
  'DAYS_90_PLUS',
] as const;
export type AgingBucket = (typeof AGING_BUCKETS)[number];

export function agingBucket(daysPastDue: number): AgingBucket {
  if (daysPastDue <= 0) return 'NOT_DUE';
  if (daysPastDue <= 30) return 'DAYS_1_30';
  if (daysPastDue <= 60) return 'DAYS_31_60';
  if (daysPastDue <= 90) return 'DAYS_61_90';
  return 'DAYS_90_PLUS';
}

/** The `count` calendar months ending with `today`'s month, as YYYY-MM, oldest first. */
export function lastMonths(today: string, count: number): string[] {
  const [year, month] = today.split('-').map(Number) as [number, number];
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(Date.UTC(year, month - 1 - (count - 1 - i), 1));
    return d.toISOString().slice(0, 7);
  });
}
