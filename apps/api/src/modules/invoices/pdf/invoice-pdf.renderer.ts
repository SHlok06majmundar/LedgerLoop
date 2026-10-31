import PDFDocument from 'pdfkit';

export interface PdfParty {
  name: string;
  email?: string;
  phone?: string;
  gstin?: string;
  address?: string[];
}

export interface PdfInvoice {
  invoiceNumber: string;
  status: string;
  issueDate: string;
  dueDate: string;
  currency: string;
  items: {
    description: string;
    quantityMilli: number;
    unitPriceMinor: number;
    taxRateBps: number;
    discountMinor: number;
    totalMinor: number;
  }[];
  subtotalMinor: number;
  discountMinor: number;
  taxMinor: number;
  totalMinor: number;
  allocatedMinor: number;
  notes?: string;
  terms?: string;
}

const BRAND = '#0f766e';
const MUTED = '#71717a';
const INK = '#18181b';

/** Renders an invoice as an A4 PDF. Pure: all data comes in, bytes come out. */
export function renderInvoicePdf(
  invoice: PdfInvoice,
  seller: PdfParty,
  buyer: PdfParty,
  logo?: Buffer,
): Promise<Buffer> {
  const doc = new PDFDocument({ size: 'A4', margin: 48, info: { Title: invoice.invoiceNumber } });
  const chunks: Buffer[] = [];
  doc.on('data', (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });

  const money = (minor: number) => formatMoney(minor, invoice.currency);
  const left = 48;
  const right = doc.page.width - 48;
  const width = right - left;

  // Header
  let y = 48;
  if (logo) {
    try {
      doc.image(logo, left, y, { fit: [120, 48] });
    } catch {
      // Unsupported image formats are skipped rather than failing the invoice.
    }
  }
  doc
    .fillColor(BRAND)
    .fontSize(22)
    .font('Helvetica-Bold')
    .text('INVOICE', left, y, { width, align: 'right' });
  doc
    .fillColor(INK)
    .fontSize(10)
    .font('Helvetica')
    .text(invoice.invoiceNumber, left, y + 28, { width, align: 'right' });
  if (invoice.status === 'VOID' || invoice.status === 'DRAFT') {
    doc
      .fillColor('#dc2626')
      .font('Helvetica-Bold')
      .text(invoice.status, left, y + 42, { width, align: 'right' });
  }

  // Parties
  y = 120;
  party(doc, 'From', seller, left, y, width / 2 - 12);
  party(doc, 'Bill to', buyer, left + width / 2 + 12, y, width / 2 - 12);

  // Dates
  y = Math.max(doc.y, y + 90) + 16;
  const facts: [string, string][] = [
    ['Issue date', formatDate(invoice.issueDate)],
    ['Due date', formatDate(invoice.dueDate)],
    ['Amount due', money(invoice.totalMinor - invoice.allocatedMinor)],
  ];
  facts.forEach(([label, value], i) => {
    const x = left + (width / 3) * i;
    doc.fillColor(MUTED).fontSize(8).font('Helvetica').text(label.toUpperCase(), x, y);
    doc
      .fillColor(INK)
      .fontSize(11)
      .font('Helvetica-Bold')
      .text(value, x, y + 12);
  });

  // Items table
  y += 48;
  const cols = [
    { label: 'Description', x: left, w: width * 0.4, align: 'left' as const },
    { label: 'Qty', x: left + width * 0.4, w: width * 0.1, align: 'right' as const },
    { label: 'Rate', x: left + width * 0.5, w: width * 0.16, align: 'right' as const },
    { label: 'Tax', x: left + width * 0.66, w: width * 0.1, align: 'right' as const },
    { label: 'Amount', x: left + width * 0.76, w: width * 0.24, align: 'right' as const },
  ];
  doc.rect(left, y, width, 22).fill('#f4f4f5');
  cols.forEach((c) =>
    doc
      .fillColor(MUTED)
      .fontSize(8)
      .font('Helvetica-Bold')
      .text(c.label.toUpperCase(), c.x + 6, y + 7, { width: c.w - 12, align: c.align }),
  );
  y += 28;
  doc.font('Helvetica').fontSize(9).fillColor(INK);
  for (const item of invoice.items) {
    if (y > doc.page.height - 200) {
      doc.addPage();
      y = 48;
    }
    const values = [
      item.description,
      formatQuantity(item.quantityMilli),
      money(item.unitPriceMinor),
      `${item.taxRateBps / 100}%`,
      money(item.totalMinor),
    ];
    const rowHeight = Math.max(
      16,
      doc.heightOfString(item.description, { width: cols[0]!.w - 12 }) + 6,
    );
    cols.forEach((c, i) => doc.text(values[i]!, c.x + 6, y, { width: c.w - 12, align: c.align }));
    y += rowHeight;
    doc
      .moveTo(left, y - 3)
      .lineTo(right, y - 3)
      .strokeColor('#e4e4e7')
      .lineWidth(0.5)
      .stroke();
  }

  // Totals
  y += 8;
  const totals: [string, string, boolean][] = [
    ['Subtotal', money(invoice.subtotalMinor), false],
    ['Discount', `- ${money(invoice.discountMinor)}`, false],
    ['Tax', money(invoice.taxMinor), false],
    ['Total', money(invoice.totalMinor), true],
  ];
  if (invoice.allocatedMinor > 0) {
    totals.push(['Paid', `- ${money(invoice.allocatedMinor)}`, false]);
    totals.push(['Balance due', money(invoice.totalMinor - invoice.allocatedMinor), true]);
  }
  const labelX = left + width * 0.55;
  for (const [label, value, strong] of totals) {
    doc
      .font(strong ? 'Helvetica-Bold' : 'Helvetica')
      .fontSize(strong ? 11 : 9)
      .fillColor(strong ? INK : MUTED);
    doc.text(label, labelX, y, { width: width * 0.2 });
    doc
      .fillColor(INK)
      .text(value, labelX + width * 0.2, y, { width: width * 0.25, align: 'right' });
    y += strong ? 18 : 14;
  }

  // Notes and terms
  y += 16;
  for (const [title, body] of [
    ['Notes', invoice.notes],
    ['Terms', invoice.terms],
  ] as const) {
    if (!body) continue;
    doc.fillColor(MUTED).fontSize(8).font('Helvetica-Bold').text(title.toUpperCase(), left, y);
    doc
      .fillColor(INK)
      .fontSize(9)
      .font('Helvetica')
      .text(body, left, y + 12, { width });
    y = doc.y + 12;
  }

  doc
    .fillColor(MUTED)
    .fontSize(8)
    .text('Generated by LedgerLoop', left, doc.page.height - 60, { width, align: 'center' });
  doc.end();
  return done;
}

function party(
  doc: PDFKit.PDFDocument,
  title: string,
  p: PdfParty,
  x: number,
  y: number,
  w: number,
) {
  doc
    .fillColor(MUTED)
    .fontSize(8)
    .font('Helvetica-Bold')
    .text(title.toUpperCase(), x, y, { width: w });
  doc
    .fillColor(INK)
    .fontSize(11)
    .font('Helvetica-Bold')
    .text(p.name, x, y + 12, { width: w });
  doc.font('Helvetica').fontSize(9);
  const lines = [...(p.address ?? []), p.email, p.phone, p.gstin && `GSTIN: ${p.gstin}`].filter(
    Boolean,
  );
  doc.text(lines.join('\n'), x, doc.y + 2, { width: w });
}

/** "INR 2,36,000.00": the built-in PDF fonts have no rupee glyph. */
export function formatMoney(minor: number, currency: string): string {
  const sign = minor < 0 ? '-' : '';
  const abs = Math.abs(minor);
  const whole = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(
    Math.trunc(abs / 100),
  );
  return `${sign}${currency} ${whole}.${String(abs % 100).padStart(2, '0')}`;
}

function formatQuantity(milli: number): string {
  return milli % 1000 === 0 ? String(milli / 1000) : (milli / 1000).toFixed(3).replace(/0+$/, '');
}

function formatDate(date: string): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}
