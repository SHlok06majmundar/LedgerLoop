/**
 * Scores how well a bank statement line matches recorded payments or open
 * invoices, and decides whether it may be matched automatically.
 * Pure: no I/O, every decision carries its reasons.
 */

export interface StatementLine {
  amountMinor: number;
  /** YYYY-MM-DD */
  transactionDate: string;
  description: string;
  reference?: string;
}

export interface Candidate {
  /** PAYMENT: a recorded payment awaiting its bank line. INVOICE(S): money paid straight against invoices. */
  kind: 'PAYMENT' | 'INVOICE' | 'INVOICE_GROUP';
  key: string;
  customerId: string;
  customerName: string;
  /** Payment amount, or outstanding amount of the invoice(s). */
  amountMinor: number;
  reference?: string;
  /** Payment date or invoice issue date. */
  date: string;
  invoiceNumbers: string[];
  invoiceIds?: string[];
}

export interface MatchPolicy {
  weights: {
    reference: number;
    amount: number;
    partialAmount: number;
    customer: number;
    date: number;
    invoiceNumber: number;
  };
  autoMatchThreshold: number;
  suggestThreshold: number;
  dateWindowDays: number;
  /** A runner-up this close to the best makes the result ambiguous. */
  ambiguityMargin: number;
}

/** Initial design weights from the product spec; tune per organization. */
export const DEFAULT_POLICY: MatchPolicy = {
  weights: {
    reference: 40,
    amount: 25,
    partialAmount: 10,
    customer: 20,
    date: 10,
    invoiceNumber: 5,
  },
  autoMatchThreshold: 90,
  suggestThreshold: 70,
  dateWindowDays: 7,
  ambiguityMargin: 5,
};

export type SignalCode =
  | 'REFERENCE_MATCH'
  | 'INVOICE_REFERENCE'
  | 'AMOUNT_EXACT'
  | 'AMOUNT_PARTIAL'
  | 'CUSTOMER_MATCH'
  | 'DATE_PROXIMITY'
  | 'INVOICE_NUMBER';

export type BlockCode = 'REFERENCE_CONFLICT' | 'AMOUNT_MISMATCH' | 'OVER_ALLOCATION' | 'AMBIGUOUS';

export interface Signal {
  code: SignalCode;
  points: number;
  detail: string;
}

export interface ScoredCandidate {
  candidate: Candidate;
  score: number;
  signals: Signal[];
  /** Hard rules that forbid automatic approval regardless of score. */
  blocks: BlockCode[];
  partial: boolean;
}

export type MatchOutcome =
  'MATCHED' | 'SUGGESTED' | 'PARTIALLY_MATCHED' | 'DISCREPANCY' | 'UNMATCHED' | 'IGNORED';

export interface MatchResult {
  status: MatchOutcome;
  best: ScoredCandidate | null;
  alternatives: ScoredCandidate[];
}

const COMPANY_SUFFIXES = new Set([
  'PVT',
  'PRIVATE',
  'LTD',
  'LIMITED',
  'LLP',
  'INC',
  'CO',
  'AND',
  'THE',
  'M',
  'S',
  'MS',
]);

/** Uppercase alphanumeric words. */
export function normalizeText(text: string): string {
  return text
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim();
}

const compact = (text: string) => text.toUpperCase().replace(/[^A-Z0-9]/g, '');

/** True when the narration contains the customer's distinctive name. */
export function mentionsCustomer(description: string, customerName: string): boolean {
  const narration = compact(description);
  const words = normalizeText(customerName)
    .split(' ')
    .filter((w) => !COMPANY_SUFFIXES.has(w));
  // Initialisms like "A.B.C." collapse into one token.
  const tokens = words.reduce<string[]>((acc, w) => {
    if (
      w.length === 1 &&
      acc.length &&
      /^[A-Z]+$/.test(acc[acc.length - 1]!) &&
      acc[acc.length - 1]!.length < 4 &&
      words.indexOf(w) > 0
    ) {
      acc[acc.length - 1] += w;
    } else acc.push(w);
    return acc;
  }, []);
  const significant = tokens.filter((t) => t.length >= 3);
  if (significant.length === 0) return false;
  if (narration.includes(significant.join(''))) return true;
  const hits = significant.filter((t) => narration.includes(t)).length;
  return hits / significant.length >= 0.6 && hits >= Math.min(2, significant.length);
}

function daysApart(a: string, b: string): number {
  return Math.abs(Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86_400_000;
}

export function score(line: StatementLine, c: Candidate, policy: MatchPolicy): ScoredCandidate {
  const w = policy.weights;
  const signals: Signal[] = [];
  const blocks: BlockCode[] = [];
  const narration = compact(`${line.description} ${line.reference ?? ''}`);
  let partial = false;

  // Reference: bank reference equals the payment's, or the narration names the invoice.
  if (c.kind === 'PAYMENT' && c.reference) {
    const ref = compact(c.reference);
    if ((line.reference && compact(line.reference) === ref) || narration.includes(ref)) {
      signals.push({
        code: 'REFERENCE_MATCH',
        points: w.reference,
        detail: `Bank reference ${line.reference ?? c.reference} matches the payment reference`,
      });
    } else if (line.reference) {
      blocks.push('REFERENCE_CONFLICT');
    }
  }
  const namedInvoices = c.invoiceNumbers.filter((n) => narration.includes(compact(n)));
  if (c.kind !== 'PAYMENT' && namedInvoices.length > 0) {
    signals.push({
      code: 'INVOICE_REFERENCE',
      points: w.reference,
      detail: `Narration names ${namedInvoices.join(', ')}`,
    });
  }

  // Amount
  if (line.amountMinor === c.amountMinor) {
    signals.push({ code: 'AMOUNT_EXACT', points: w.amount, detail: 'Amount matches exactly' });
  } else if (c.kind === 'PAYMENT') {
    blocks.push('AMOUNT_MISMATCH');
  } else if (line.amountMinor < c.amountMinor) {
    partial = true;
    signals.push({
      code: 'AMOUNT_PARTIAL',
      points: w.partialAmount,
      detail: 'Amount is less than the outstanding balance (partial payment)',
    });
  } else {
    blocks.push('OVER_ALLOCATION');
  }

  if (mentionsCustomer(line.description, c.customerName)) {
    signals.push({
      code: 'CUSTOMER_MATCH',
      points: w.customer,
      detail: `Narration mentions ${c.customerName}`,
    });
  }

  const days = daysApart(line.transactionDate, c.date);
  if (days <= policy.dateWindowDays) {
    const points = Math.round(w.date * (1 - days / policy.dateWindowDays));
    if (points > 0) {
      signals.push({
        code: 'DATE_PROXIMITY',
        points,
        detail: days === 0 ? 'Same date' : `${days} day${days === 1 ? '' : 's'} apart`,
      });
    }
  }

  if (c.kind === 'PAYMENT' && namedInvoices.length > 0) {
    signals.push({
      code: 'INVOICE_NUMBER',
      points: w.invoiceNumber,
      detail: `Narration names ${namedInvoices.join(', ')}`,
    });
  }

  return {
    candidate: c,
    score: Math.min(
      100,
      signals.reduce((sum, s) => sum + s.points, 0),
    ),
    signals,
    blocks,
    partial,
  };
}

export function evaluate(
  line: StatementLine,
  candidates: Candidate[],
  policy: MatchPolicy,
  direction: 'CREDIT' | 'DEBIT' = 'CREDIT',
): MatchResult {
  if (direction === 'DEBIT') return { status: 'IGNORED', best: null, alternatives: [] };

  const ranked = candidates
    .map((c) => score(line, c, policy))
    .sort((a, b) => b.score - a.score || a.blocks.length - b.blocks.length);
  const [best, ...rest] = ranked;
  if (!best) return { status: 'UNMATCHED', best: null, alternatives: [] };

  const alternatives = rest.filter((r) => r.score >= policy.suggestThreshold).slice(0, 4);
  const runnerUp = rest[0];
  if (
    runnerUp &&
    runnerUp.score >= policy.suggestThreshold &&
    best.score - runnerUp.score < policy.ambiguityMargin
  ) {
    best.blocks.push('AMBIGUOUS');
  }

  return { status: decide(best, policy), best, alternatives };
}

function decide(best: ScoredCandidate, policy: MatchPolicy): MatchOutcome {
  const blocked = (code: BlockCode) => best.blocks.includes(code);
  if (blocked('OVER_ALLOCATION')) return 'UNMATCHED';
  const hasReference = best.signals.some(
    (s) => s.code === 'REFERENCE_MATCH' || s.code === 'INVOICE_REFERENCE',
  );
  if (blocked('AMOUNT_MISMATCH') && hasReference) return 'DISCREPANCY';
  if (best.score < policy.suggestThreshold || blocked('AMOUNT_MISMATCH')) return 'UNMATCHED';
  if (best.partial) return 'PARTIALLY_MATCHED';
  if (best.score >= policy.autoMatchThreshold && best.blocks.length === 0) return 'MATCHED';
  return 'SUGGESTED';
}
