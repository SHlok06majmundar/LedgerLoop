/**
 * Money arithmetic in integer minor units (see docs/adr/0002).
 * Quantities are thousandths, tax rates are basis points.
 */

export interface LineInput {
  quantityMilli: number;
  unitPriceMinor: number;
  taxRateBps: number;
  discountMinor: number;
}

export interface LineTotals {
  amountMinor: number;
  taxMinor: number;
  totalMinor: number;
}

export interface InvoiceTotals {
  lines: LineTotals[];
  subtotalMinor: number;
  discountMinor: number;
  taxMinor: number;
  totalMinor: number;
}

export function assertMinor(value: number, field: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${field} must be a non-negative safe integer, got ${value}`);
  }
}

/** Divides and rounds half-up; inputs are non-negative. */
function divRoundHalfUp(numerator: bigint, denominator: bigint): bigint {
  return (numerator * 2n + denominator) / (denominator * 2n);
}

function toSafeNumber(value: bigint, field: string): number {
  if (value > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new RangeError(`${field} exceeds the supported amount range`);
  }
  return Number(value);
}

export function calculateLine(line: LineInput): LineTotals {
  assertMinor(line.quantityMilli, 'quantityMilli');
  assertMinor(line.unitPriceMinor, 'unitPriceMinor');
  assertMinor(line.taxRateBps, 'taxRateBps');
  assertMinor(line.discountMinor, 'discountMinor');

  const amount = divRoundHalfUp(BigInt(line.quantityMilli) * BigInt(line.unitPriceMinor), 1000n);
  const discount = BigInt(line.discountMinor);
  if (discount > amount) {
    throw new RangeError('discountMinor cannot exceed the line amount');
  }
  const tax = divRoundHalfUp((amount - discount) * BigInt(line.taxRateBps), 10_000n);

  return {
    amountMinor: toSafeNumber(amount, 'amountMinor'),
    taxMinor: toSafeNumber(tax, 'taxMinor'),
    totalMinor: toSafeNumber(amount - discount + tax, 'totalMinor'),
  };
}

export function calculateInvoiceTotals(lines: LineInput[]): InvoiceTotals {
  const lineTotals = lines.map(calculateLine);
  const sum = (pick: (l: LineTotals) => number) =>
    lineTotals.reduce((acc, l) => acc + BigInt(pick(l)), 0n);
  const discount = lines.reduce((acc, l) => acc + BigInt(l.discountMinor), 0n);

  return {
    lines: lineTotals,
    subtotalMinor: toSafeNumber(sum((l) => l.amountMinor), 'subtotalMinor'),
    discountMinor: toSafeNumber(discount, 'discountMinor'),
    taxMinor: toSafeNumber(sum((l) => l.taxMinor), 'taxMinor'),
    totalMinor: toSafeNumber(sum((l) => l.totalMinor), 'totalMinor'),
  };
}

const formatters = new Map<string, Intl.NumberFormat>();

/** Display-edge formatting only; never parse the result back into money. */
export function formatMinor(amountMinor: number, currency = 'INR', locale = 'en-IN'): string {
  const key = `${locale}:${currency}`;
  let formatter = formatters.get(key);
  if (!formatter) {
    formatter = new Intl.NumberFormat(locale, { style: 'currency', currency });
    formatters.set(key, formatter);
  }
  const digits = formatter.resolvedOptions().maximumFractionDigits ?? 2;
  return formatter.format(amountMinor / 10 ** digits);
}
