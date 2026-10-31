import {
  detectHeaderRow,
  normalizeRow,
  parseAmount,
  parseStatementDate,
  suggestMapping,
} from './statement-parsing';

describe('parseAmount', () => {
  it.each([
    ['25000', 2_500_000],
    ['25,000.00', 2_500_000],
    ['1,23,456.78', 12_345_678],
    ['₹ 1,000.5', 100_050],
    ['INR 99.99', 9_999],
    ['0.1', 10],
    ['-500.00', -50_000],
    ['(500.00)', -50_000],
    ['500.00 DR', -50_000],
    ['500.00 Cr', 50_000],
  ])('parses %s exactly', (input, minor) => {
    expect(parseAmount(input)).toBe(minor);
  });

  it.each(['', '   ', '-', '12.345', 'abc', '1.2.3'])('treats %p as no amount', (input) => {
    expect(parseAmount(input)).toBeNull();
  });
});

describe('parseStatementDate', () => {
  it.each([
    ['05/11/2026', 'DD/MM/YYYY', '2026-11-05'],
    ['5/11/26', 'DD/MM/YYYY', '2026-11-05'],
    ['05-11-2026', 'DD-MM-YYYY', '2026-11-05'],
    ['2026-11-05', 'YYYY-MM-DD', '2026-11-05'],
    ['11/05/2026', 'MM/DD/YYYY', '2026-11-05'],
    ['05-Nov-2026', 'DD-MMM-YYYY', '2026-11-05'],
    ['05 Nov 2026', 'DD-MMM-YYYY', '2026-11-05'],
  ] as const)('reads %s as %s', (input, format, expected) => {
    expect(parseStatementDate(input, format)).toBe(expected);
  });

  it('rejects impossible dates', () => {
    expect(parseStatementDate('31/02/2026', 'DD/MM/YYYY')).toBeNull();
    expect(parseStatementDate('not a date', 'DD/MM/YYYY')).toBeNull();
  });
});

describe('normalizeRow', () => {
  const split = {
    date: 'Date',
    description: 'Narration',
    reference: 'Ref',
    debit: 'Withdrawal',
    credit: 'Deposit',
  };

  it('reads a credit from separate debit and credit columns', () => {
    const row = {
      Date: '05/11/2026',
      Narration: 'NEFT-ABC TRADERS-INV-2026-0001',
      Ref: 'UTR123',
      Withdrawal: '',
      Deposit: '25,000.00',
    };

    expect(normalizeRow(row, split, 'DD/MM/YYYY')).toEqual({
      ok: true,
      value: {
        transactionDate: '2026-11-05',
        description: 'NEFT-ABC TRADERS-INV-2026-0001',
        reference: 'UTR123',
        amountMinor: 2_500_000,
        direction: 'CREDIT',
      },
    });
  });

  it('reads a debit from a single signed amount column', () => {
    const row = { Date: '2026-11-05', Details: 'Bank charges', Amount: '-118.00' };

    const result = normalizeRow(
      row,
      { date: 'Date', description: 'Details', amount: 'Amount' },
      'YYYY-MM-DD',
    );

    expect(result).toMatchObject({ ok: true, value: { amountMinor: 11_800, direction: 'DEBIT' } });
  });

  it('explains why a row cannot be imported', () => {
    expect(
      normalizeRow({ Date: 'yesterday', Narration: 'x', Deposit: '10' }, split, 'DD/MM/YYYY'),
    ).toEqual({
      ok: false,
      error: 'Invalid date "yesterday" (expected DD/MM/YYYY)',
    });
    expect(
      normalizeRow(
        { Date: '05/11/2026', Narration: 'x', Deposit: '', Withdrawal: '' },
        split,
        'DD/MM/YYYY',
      ),
    ).toEqual({
      ok: false,
      error: 'No amount in debit or credit column',
    });
  });
});

describe('suggestMapping', () => {
  it('recognizes an HDFC-style header', () => {
    const headers = [
      'Date',
      'Narration',
      'Chq./Ref.No.',
      'Value Dt',
      'Withdrawal Amt.',
      'Deposit Amt.',
      'Closing Balance',
    ];

    expect(suggestMapping(headers)).toEqual({
      date: 'Date',
      description: 'Narration',
      reference: 'Chq./Ref.No.',
      debit: 'Withdrawal Amt.',
      credit: 'Deposit Amt.',
    });
  });

  it('recognizes a single amount column', () => {
    expect(suggestMapping(['Transaction Date', 'Description', 'Amount', 'Reference'])).toEqual({
      date: 'Transaction Date',
      description: 'Description',
      reference: 'Reference',
      amount: 'Amount',
    });
  });
});

describe('detectHeaderRow', () => {
  it('skips a bank preamble to find the header row', () => {
    const rows = [
      ['HDFC BANK Ltd.'],
      ['Account No : 50100012345678'],
      [''],
      ['Date', 'Narration', 'Chq./Ref.No.', 'Value Dt', 'Withdrawal Amt.', 'Deposit Amt.'],
      ['05/11/26', 'NEFT CR', 'UTR1', '05/11/26', '', '1000.00'],
    ];

    expect(detectHeaderRow(rows)).toBe(3);
  });
});
