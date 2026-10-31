/**
 * Pure parsing of bank statement rows. Amounts are parsed from text into
 * minor units without ever becoming floating-point numbers.
 */

export const DATE_FORMATS = [
  'DD/MM/YYYY',
  'DD-MM-YYYY',
  'YYYY-MM-DD',
  'MM/DD/YYYY',
  'DD-MMM-YYYY',
] as const;
export type DateFormat = (typeof DATE_FORMATS)[number];

export interface ColumnMapping {
  date: string;
  description: string;
  reference?: string;
  /** Either one signed amount column... */
  amount?: string;
  /** ...or separate debit and credit columns. */
  debit?: string;
  credit?: string;
}

export interface NormalizedRow {
  transactionDate: string;
  description: string;
  reference?: string;
  amountMinor: number;
  direction: 'CREDIT' | 'DEBIT';
}

export type RowResult = { ok: true; value: NormalizedRow } | { ok: false; error: string };

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

/** "1,23,456.78" → 12345678; "(500)", "-500" and "500 DR" are negative. Null when blank or invalid. */
export function parseAmount(raw: string): number | null {
  let text = raw.trim().toUpperCase();
  if (!text) return null;
  let negative = false;
  if (/^\(.*\)$/.test(text)) {
    negative = true;
    text = text.slice(1, -1);
  }
  const suffix = text.match(/\s*(CR|DR)\.?$/);
  if (suffix) {
    negative = negative || suffix[1] === 'DR';
    text = text.slice(0, suffix.index);
  }
  text = text.replace(/₹|INR|RS\.?|,|\s/g, '');
  if (text.startsWith('-')) {
    negative = !negative;
    text = text.slice(1);
  } else if (text.startsWith('+')) {
    text = text.slice(1);
  }
  const match = text.match(/^(\d+)(?:\.(\d{1,2}))?$/);
  if (!match) return null;
  const minor = Number(match[1]) * 100 + Number((match[2] ?? '').padEnd(2, '0'));
  if (!Number.isSafeInteger(minor)) return null;
  return negative ? -minor : minor;
}

/** Converts a statement date in the given format to YYYY-MM-DD, or null. */
export function parseStatementDate(raw: string, format: DateFormat): string | null {
  const text = raw.trim();
  let day: number;
  let month: number;
  let year: number;

  if (format === 'DD-MMM-YYYY') {
    const m = text.match(/^(\d{1,2})[\s-/]([A-Za-z]{3})[A-Za-z]*[\s-/,]+(\d{2,4})$/);
    if (!m) return null;
    day = Number(m[1]);
    month = MONTHS.indexOf(m[2]!.toLowerCase()) + 1;
    year = Number(m[3]);
  } else if (format === 'YYYY-MM-DD') {
    const m = text.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
    if (!m) return null;
    [year, month, day] = [Number(m[1]), Number(m[2]), Number(m[3])];
  } else {
    const m = text.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/);
    if (!m) return null;
    const [a, b] = [Number(m[1]), Number(m[2])];
    [day, month] = format === 'MM/DD/YYYY' ? [b, a] : [a, b];
    year = Number(m[3]);
  }
  if (year < 100) year += 2000;

  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    month < 1 ||
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return date.toISOString().slice(0, 10);
}

export function normalizeRow(
  row: Record<string, string | undefined>,
  mapping: ColumnMapping,
  dateFormat: DateFormat,
): RowResult {
  const rawDate = row[mapping.date] ?? '';
  const transactionDate = parseStatementDate(rawDate, dateFormat);
  if (!transactionDate) {
    return { ok: false, error: `Invalid date "${rawDate}" (expected ${dateFormat})` };
  }

  let signed: number | null;
  if (mapping.amount) {
    signed = parseAmount(row[mapping.amount] ?? '');
    if (signed === null)
      return { ok: false, error: `Invalid amount "${row[mapping.amount] ?? ''}"` };
  } else {
    const credit = parseAmount(row[mapping.credit ?? ''] ?? '');
    const debit = parseAmount(row[mapping.debit ?? ''] ?? '');
    if (credit && debit) return { ok: false, error: 'Row has both a debit and a credit amount' };
    if (credit) signed = Math.abs(credit);
    else if (debit) signed = -Math.abs(debit);
    else return { ok: false, error: 'No amount in debit or credit column' };
  }
  if (signed === 0) return { ok: false, error: 'Amount is zero' };

  const description = (row[mapping.description] ?? '').trim().replace(/\s+/g, ' ');
  const reference = mapping.reference ? row[mapping.reference]?.trim() || undefined : undefined;
  return {
    ok: true,
    value: {
      transactionDate,
      description,
      ...(reference && { reference }),
      amountMinor: Math.abs(signed),
      direction: signed > 0 ? 'CREDIT' : 'DEBIT',
    },
  };
}

const PATTERNS: [keyof ColumnMapping, RegExp][] = [
  ['date', /^(txn |transaction |value )?(date|dt)\b|^date$/i],
  ['description', /narration|description|particulars|remarks|details/i],
  ['reference', /ref|chq|cheque|utr/i],
  ['debit', /withdrawal|debit|\bdr\b/i],
  ['credit', /deposit|credit|\bcr\b/i],
  ['amount', /^(transaction )?amount/i],
];

/** Guesses the column mapping from common Indian bank statement headers. */
export function suggestMapping(headers: string[]): Partial<ColumnMapping> {
  const mapping: Partial<ColumnMapping> = {};
  const used = new Set<string>();
  for (const [field, pattern] of PATTERNS) {
    const header = headers.find((h) => !used.has(h) && pattern.test(h.trim()));
    if (header) {
      mapping[field] = header;
      used.add(header);
    }
  }
  if (mapping.debit && mapping.credit) delete mapping.amount;
  else {
    delete mapping.debit;
    delete mapping.credit;
  }
  return mapping;
}

/** Finds the header row (0-based) in the first rows; bank exports often start with a preamble. */
export function detectHeaderRow(rows: string[][], scan = 30): number {
  for (let i = 0; i < Math.min(rows.length, scan); i++) {
    const m = suggestMapping(rows[i]!.map((c) => c.trim()));
    if (m.date && m.description && (m.amount || (m.debit && m.credit))) return i;
  }
  return 0;
}

/**
 * Identity of a statement line for duplicate detection. `occurrence` counts
 * identical lines earlier in the same file, so two genuine identical
 * transfers both import, while re-importing the same file adds nothing.
 */
export function fingerprintParts(row: NormalizedRow, occurrence: number): string {
  return [
    row.transactionDate,
    row.direction,
    row.amountMinor,
    (row.reference ?? '').toUpperCase().replace(/[^A-Z0-9]/g, ''),
    row.description.toUpperCase().replace(/[^A-Z0-9]/g, ''),
    occurrence,
  ].join('|');
}
