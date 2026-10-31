import { calculateInvoiceTotals } from './money';

describe('calculateInvoiceTotals', () => {
  it('totals a single line with 18% tax', () => {
    // 2 units x ₹1,000.00 = ₹2,000.00; 18% tax = ₹360.00
    const totals = calculateInvoiceTotals([
      { quantityMilli: 2000, unitPriceMinor: 100_000, taxRateBps: 1800, discountMinor: 0 },
    ]);

    expect(totals).toEqual({
      lines: [{ amountMinor: 200_000, taxMinor: 36_000, totalMinor: 236_000 }],
      subtotalMinor: 200_000,
      discountMinor: 0,
      taxMinor: 36_000,
      totalMinor: 236_000,
    });
  });

  it('applies the line discount before tax', () => {
    // ₹1,000.00 - ₹100.00 discount = ₹900.00 taxable; 5% = ₹45.00
    const totals = calculateInvoiceTotals([
      { quantityMilli: 1000, unitPriceMinor: 100_000, taxRateBps: 500, discountMinor: 10_000 },
    ]);

    expect(totals.taxMinor).toBe(4_500);
    expect(totals.totalMinor).toBe(94_500);
  });

  it('rounds fractional quantities half-up to the paisa', () => {
    // 1.255 kg x ₹10.01 = 1256.255 paise -> 1256
    // 0.5 x ₹0.03 = 1.5 paise -> 2
    const totals = calculateInvoiceTotals([
      { quantityMilli: 1255, unitPriceMinor: 1001, taxRateBps: 0, discountMinor: 0 },
      { quantityMilli: 500, unitPriceMinor: 3, taxRateBps: 0, discountMinor: 0 },
    ]);

    expect(totals.lines.map((l) => l.amountMinor)).toEqual([1256, 2]);
    expect(totals.subtotalMinor).toBe(1258);
  });

  it('sums several lines without floating-point drift', () => {
    // 3 lines of ₹0.10 + ₹0.20 style values that drift as floats
    const totals = calculateInvoiceTotals([
      { quantityMilli: 1000, unitPriceMinor: 10, taxRateBps: 0, discountMinor: 0 },
      { quantityMilli: 1000, unitPriceMinor: 20, taxRateBps: 0, discountMinor: 0 },
      { quantityMilli: 1000, unitPriceMinor: 30, taxRateBps: 1800, discountMinor: 0 },
    ]);

    expect(totals.totalMinor).toBe(65);
  });

  it('handles large invoices beyond float-safe intermediate products', () => {
    // 1,000,000 units x ₹1,00,000.00 = ₹1,00,00,00,00,000.00
    const totals = calculateInvoiceTotals([
      { quantityMilli: 1_000_000_000, unitPriceMinor: 10_000_000, taxRateBps: 0, discountMinor: 0 },
    ]);

    expect(totals.subtotalMinor).toBe(10_000_000_000_000);
  });

  it('rejects a discount larger than the line amount', () => {
    expect(() =>
      calculateInvoiceTotals([
        { quantityMilli: 1000, unitPriceMinor: 500, taxRateBps: 0, discountMinor: 501 },
      ]),
    ).toThrow(/discount/i);
  });

  it('rejects non-integer money', () => {
    expect(() =>
      calculateInvoiceTotals([
        { quantityMilli: 1000, unitPriceMinor: 10.5, taxRateBps: 0, discountMinor: 0 },
      ]),
    ).toThrow(/integer/i);
  });
});
