import { formatMoney, renderInvoicePdf } from './invoice-pdf.renderer';

describe('formatMoney', () => {
  it('groups rupees the Indian way and keeps paise exact', () => {
    expect(formatMoney(23_600_005, 'INR')).toBe('INR 2,36,000.05');
    expect(formatMoney(99, 'INR')).toBe('INR 0.99');
    expect(formatMoney(-1_000, 'INR')).toBe('-INR 10.00');
  });
});

describe('renderInvoicePdf', () => {
  it('produces a PDF document', async () => {
    const pdf = await renderInvoicePdf(
      {
        invoiceNumber: 'INV-2026-0001',
        status: 'ISSUED',
        issueDate: '2026-11-01',
        dueDate: '2026-11-16',
        currency: 'INR',
        items: [
          {
            description: 'Steel rods',
            quantityMilli: 2500,
            unitPriceMinor: 100_000,
            taxRateBps: 1800,
            discountMinor: 0,
            totalMinor: 295_000,
          },
        ],
        subtotalMinor: 250_000,
        discountMinor: 0,
        taxMinor: 45_000,
        totalMinor: 295_000,
        allocatedMinor: 0,
      },
      { name: 'ABC Traders' },
      { name: 'Sharma Wholesale', gstin: '27AAPFU0939F1ZV' },
    );

    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
  });
});
