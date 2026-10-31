import { DEFAULT_POLICY, evaluate, type Candidate, type StatementLine } from './matching';

const txn = (overrides: Partial<StatementLine> = {}): StatementLine => ({
  amountMinor: 2_500_000,
  transactionDate: '2026-11-05',
  description: 'NEFT CR-HDFC0001-ABC TRADERS PVT LTD-INV-2026-0001',
  reference: 'HDFCN52026110512345',
  ...overrides,
});

const payment = (overrides: Partial<Candidate> = {}): Candidate => ({
  kind: 'PAYMENT',
  key: 'pay1',
  customerId: 'c1',
  customerName: 'ABC Traders',
  amountMinor: 2_500_000,
  reference: 'HDFCN52026110512345',
  date: '2026-11-05',
  invoiceNumbers: [],
  ...overrides,
});

const invoice = (overrides: Partial<Candidate> = {}): Candidate => ({
  kind: 'INVOICE',
  key: 'inv1',
  customerId: 'c1',
  customerName: 'ABC Traders',
  amountMinor: 2_500_000,
  date: '2026-11-01',
  invoiceNumbers: ['INV-2026-0001'],
  invoiceIds: ['inv1'],
  ...overrides,
});

describe('evaluate', () => {
  it('auto-matches a recorded payment with the same reference, amount, customer and date', () => {
    const result = evaluate(txn(), [payment()], DEFAULT_POLICY);

    expect(result.status).toBe('MATCHED');
    expect(result.best?.score).toBe(95);
    expect(result.best?.signals.map((s) => s.code)).toEqual([
      'REFERENCE_MATCH',
      'AMOUNT_EXACT',
      'CUSTOMER_MATCH',
      'DATE_PROXIMITY',
    ]);
  });

  it('suggests an open invoice paid directly when the narration names it', () => {
    const result = evaluate(txn({ reference: undefined }), [invoice()], DEFAULT_POLICY);

    // invoice number as reference 40 + amount 25 + customer 20 + date 10*(1-4/7)=4
    expect(result.status).toBe('SUGGESTED');
    expect(result.best?.score).toBe(89);
    expect(result.best?.signals[0]?.code).toBe('INVOICE_REFERENCE');
  });

  it('suggests rather than auto-matches below the automatic threshold', () => {
    const result = evaluate(
      txn({ reference: undefined, transactionDate: '2026-11-01' }),
      [payment({ reference: undefined, date: '2026-11-01' })],
      DEFAULT_POLICY,
    );

    // amount 25 + customer 20 + date 10 = 55
    expect(result.status).toBe('UNMATCHED');
    expect(result.best?.score).toBe(55);
  });

  it('never auto-matches when references conflict, whatever the score', () => {
    const result = evaluate(txn(), [payment({ reference: 'OTHERREF999' })], DEFAULT_POLICY);

    expect(result.status).not.toBe('MATCHED');
    expect(result.best?.blocks).toContain('REFERENCE_CONFLICT');
  });

  it('flags a discrepancy when a referenced payment has a different amount', () => {
    const result = evaluate(txn({ amountMinor: 2_400_000 }), [payment()], DEFAULT_POLICY);

    expect(result.status).toBe('DISCREPANCY');
    expect(result.best?.blocks).toContain('AMOUNT_MISMATCH');
  });

  it('treats a smaller transfer against a named invoice as a partial match for review', () => {
    const result = evaluate(
      txn({ amountMinor: 2_000_000, reference: undefined, transactionDate: '2026-11-01' }),
      [invoice({ amountMinor: 4_000_000 })],
      { ...DEFAULT_POLICY, suggestThreshold: 40 },
    );

    expect(result.status).toBe('PARTIALLY_MATCHED');
    expect(result.best?.signals.map((s) => s.code)).toContain('AMOUNT_PARTIAL');
  });

  it('blocks matching a transfer larger than what the invoice owes', () => {
    const result = evaluate(txn({ amountMinor: 5_000_000, reference: undefined }), [invoice()], {
      ...DEFAULT_POLICY,
      suggestThreshold: 0,
    });

    expect(result.best?.blocks).toContain('OVER_ALLOCATION');
    expect(result.status).toBe('UNMATCHED');
  });

  it('does not auto-match when two candidates are nearly as good', () => {
    const result = evaluate(txn(), [payment(), payment({ key: 'pay2' })], DEFAULT_POLICY);

    expect(result.status).toBe('SUGGESTED');
    expect(result.best?.blocks).toContain('AMBIGUOUS');
    expect(result.alternatives).toHaveLength(1);
  });

  it('matches a customer name despite punctuation and company suffixes', () => {
    const result = evaluate(
      txn({ description: 'UPI/ABC-TRADERS/OK', reference: undefined }),
      [payment({ customerName: 'A.B.C. Traders Pvt. Ltd.', reference: undefined })],
      DEFAULT_POLICY,
    );

    expect(result.best?.signals.map((s) => s.code)).toContain('CUSTOMER_MATCH');
  });

  it('ignores debits', () => {
    const result = evaluate(txn(), [payment()], DEFAULT_POLICY, 'DEBIT');

    expect(result).toEqual({ status: 'IGNORED', best: null, alternatives: [] });
  });

  it('explains each decision in plain words', () => {
    const result = evaluate(txn(), [payment()], DEFAULT_POLICY);

    expect(result.best?.signals[0]).toEqual({
      code: 'REFERENCE_MATCH',
      points: 40,
      detail: 'Bank reference HDFCN52026110512345 matches the payment reference',
    });
  });
});
