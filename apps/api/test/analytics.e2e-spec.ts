import { randomUUID } from 'node:crypto';
import { addDays, todayIn } from '../src/modules/invoices/domain/invoice-status';
import { setupOrg, type OrgContext } from './helpers';
import { createTestApp, type TestApp } from './test-app';

describe('Analytics', () => {
  let t: TestApp;
  let ctx: OrgContext;
  const today = todayIn('Asia/Kolkata');

  beforeAll(async () => {
    t = await createTestApp();
  });
  beforeEach(async () => {
    await t.reset();
    ctx = await setupOrg(t);
  });
  afterAll(() => t.close());

  async function seed() {
    const c = await t
      .http()
      .post('/api/v1/customers')
      .set(ctx.headers)
      .send({ name: 'Big Buyer' })
      .expect(201);
    const customerId = c.body.data.id as string;
    const invoice = async (amount: number, dueInDays: number) => {
      const res = await t
        .http()
        .post('/api/v1/invoices')
        .set(ctx.headers)
        .send({
          customerId,
          issueDate: addDays(today, -100),
          dueDate: addDays(today, dueInDays),
          items: [{ description: 'Goods', quantityMilli: 1000, unitPriceMinor: amount }],
        })
        .expect(201);
      await t
        .http()
        .post(`/api/v1/invoices/${res.body.data.id}/issue`)
        .set(ctx.headers)
        .expect(200);
      return res.body.data.id as string;
    };
    const notDue = await invoice(10_000, 10);
    await invoice(20_000, -15);
    await invoice(30_000, -95);
    await t
      .http()
      .post('/api/v1/payments')
      .set(ctx.headers)
      .set('Idempotency-Key', randomUUID())
      .send({
        customerId,
        amountMinor: 4_000,
        method: 'UPI',
        paymentDate: today,
        allocations: [{ invoiceId: notDue, amountMinor: 4_000 }],
      })
      .expect(201);
  }

  it('summarizes receivables on the dashboard', async () => {
    await seed();

    const res = await t.http().get('/api/v1/analytics/dashboard').set(ctx.headers).expect(200);

    expect(res.body.data).toMatchObject({
      currency: 'INR',
      totalInvoicedMinor: 60_000,
      totalReceivedMinor: 4_000,
      totalOutstandingMinor: 56_000,
      overdueMinor: 50_000,
      overdueInvoices: 2,
      partiallyPaidInvoices: 1,
      collectionRateBps: 667,
    });
  });

  it('groups outstanding amounts into aging buckets', async () => {
    await seed();

    const res = await t.http().get('/api/v1/analytics/aging').set(ctx.headers).expect(200);

    expect(res.body.data.buckets).toEqual([
      { bucket: 'NOT_DUE', amountMinor: 6_000, invoices: 1 },
      { bucket: 'DAYS_1_30', amountMinor: 20_000, invoices: 1 },
      { bucket: 'DAYS_31_60', amountMinor: 0, invoices: 0 },
      { bucket: 'DAYS_61_90', amountMinor: 0, invoices: 0 },
      { bucket: 'DAYS_90_PLUS', amountMinor: 30_000, invoices: 1 },
    ]);
  });

  it('ranks customers by outstanding amount', async () => {
    await seed();

    const res = await t.http().get('/api/v1/analytics/customers').set(ctx.headers).expect(200);

    expect(res.body.data).toEqual([
      expect.objectContaining({ name: 'Big Buyer', outstandingMinor: 56_000, openInvoices: 3 }),
    ]);
  });

  it('returns a full monthly series even for empty months', async () => {
    const res = await t
      .http()
      .get('/api/v1/analytics/collections?months=6')
      .set(ctx.headers)
      .expect(200);

    expect(res.body.data).toHaveLength(6);
    expect(res.body.data.at(-1)).toEqual({
      month: today.slice(0, 7),
      invoicedMinor: 0,
      receivedMinor: 0,
      outstandingMinor: 0,
    });
  });

  it('keeps analytics within the organization', async () => {
    await seed();
    const other = await setupOrg(t, 'rival@example.com', 'Rival');

    const res = await t.http().get('/api/v1/analytics/dashboard').set(other.headers).expect(200);

    expect(res.body.data.totalInvoicedMinor).toBe(0);
  });
});
