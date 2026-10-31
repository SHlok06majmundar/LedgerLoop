import { randomUUID } from 'node:crypto';
import { setupOrg, type OrgContext } from './helpers';
import { createTestApp, type TestApp } from './test-app';

describe('Payments and allocations', () => {
  let t: TestApp;
  let ctx: OrgContext;
  let customerId: string;

  beforeAll(async () => {
    t = await createTestApp();
  });
  beforeEach(async () => {
    await t.reset();
    ctx = await setupOrg(t);
    customerId = await createCustomer('ABC Traders');
  });
  afterAll(() => t.close());

  async function createCustomer(name: string) {
    const res = await t
      .http()
      .post('/api/v1/customers')
      .set(ctx.headers)
      .send({ name })
      .expect(201);
    return res.body.data.id as string;
  }

  /** An issued invoice for the given total (single untaxed line). */
  async function issuedInvoice(totalMinor: number, forCustomer = customerId) {
    const draft = await t
      .http()
      .post('/api/v1/invoices')
      .set(ctx.headers)
      .send({
        customerId: forCustomer,
        issueDate: '2026-11-01',
        dueDate: '2099-12-31',
        items: [{ description: 'Goods', quantityMilli: 1000, unitPriceMinor: totalMinor }],
      })
      .expect(201);
    await t
      .http()
      .post(`/api/v1/invoices/${draft.body.data.id}/issue`)
      .set(ctx.headers)
      .expect(200);
    return draft.body.data.id as string;
  }

  const getInvoice = async (id: string) =>
    (await t.http().get(`/api/v1/invoices/${id}`).set(ctx.headers).expect(200)).body.data;

  const recordPayment = (body: Record<string, unknown>, key: string = randomUUID()) =>
    t
      .http()
      .post('/api/v1/payments')
      .set(ctx.headers)
      .set('Idempotency-Key', key)
      .send({ customerId, method: 'NEFT', paymentDate: '2026-11-05', ...body });

  const allocate = (paymentId: string, allocations: unknown[]) =>
    t
      .http()
      .post(`/api/v1/payments/${paymentId}/allocations`)
      .set(ctx.headers)
      .set('Idempotency-Key', randomUUID())
      .send({ allocations });

  const reverse = (paymentId: string, body: Record<string, unknown>) =>
    t
      .http()
      .post(`/api/v1/payments/${paymentId}/reversals`)
      .set(ctx.headers)
      .set('Idempotency-Key', randomUUID())
      .send(body);

  it('allocates one payment across several invoices', async () => {
    const inv1 = await issuedInvoice(25_000_00);
    const inv2 = await issuedInvoice(40_000_00);

    const res = await recordPayment({
      amountMinor: 45_000_00,
      reference: 'utr123',
      allocations: [
        { invoiceId: inv1, amountMinor: 25_000_00 },
        { invoiceId: inv2, amountMinor: 20_000_00 },
      ],
    }).expect(201);

    expect(res.body.data).toMatchObject({
      amountMinor: 45_000_00,
      allocatedMinor: 45_000_00,
      unallocatedMinor: 0,
      reference: 'UTR123',
      status: 'POSTED',
    });
    expect(await getInvoice(inv1)).toMatchObject({ status: 'PAID', outstandingMinor: 0 });
    expect(await getInvoice(inv2)).toMatchObject({
      status: 'PARTIALLY_PAID',
      outstandingMinor: 20_000_00,
    });
  });

  it('refuses to allocate more than an invoice owes and records nothing', async () => {
    const inv = await issuedInvoice(10_000);

    const res = await recordPayment({
      amountMinor: 15_000,
      allocations: [{ invoiceId: inv, amountMinor: 15_000 }],
    }).expect(422);

    expect(res.body.errorCode).toBe('INVOICE_OVER_ALLOCATED');
    const list = await t.http().get('/api/v1/payments').set(ctx.headers).expect(200);
    expect(list.body.data).toHaveLength(0);
    expect(await getInvoice(inv)).toMatchObject({ allocatedMinor: 0 });
  });

  it('refuses to allocate more than the payment has left', async () => {
    const inv1 = await issuedInvoice(10_000);
    const inv2 = await issuedInvoice(10_000);
    const payment = await recordPayment({
      amountMinor: 12_000,
      allocations: [{ invoiceId: inv1, amountMinor: 10_000 }],
    }).expect(201);

    const res = await allocate(payment.body.data.id, [
      { invoiceId: inv2, amountMinor: 3_000 },
    ]).expect(422);

    expect(res.body.errorCode).toBe('PAYMENT_OVER_ALLOCATED');
  });

  it('lets exactly one of two racing allocations through', async () => {
    const inv = await issuedInvoice(10_000);
    const a = await recordPayment({ amountMinor: 10_000 }).expect(201);
    const b = await recordPayment({ amountMinor: 10_000 }).expect(201);

    const results = await Promise.all([
      allocate(a.body.data.id, [{ invoiceId: inv, amountMinor: 10_000 }]),
      allocate(b.body.data.id, [{ invoiceId: inv, amountMinor: 10_000 }]),
    ]);

    expect(results.map((r) => r.status).sort()).toEqual([201, 422]);
    expect(await getInvoice(inv)).toMatchObject({ allocatedMinor: 10_000, status: 'PAID' });
  });

  it('only allocates to open invoices of the same customer', async () => {
    const other = await createCustomer('Someone Else');
    const otherInvoice = await issuedInvoice(5_000, other);
    const draft = await t
      .http()
      .post('/api/v1/invoices')
      .set(ctx.headers)
      .send({
        customerId,
        issueDate: '2026-11-01',
        items: [{ description: 'Draft', quantityMilli: 1000, unitPriceMinor: 5_000 }],
      })
      .expect(201);
    const payment = await recordPayment({ amountMinor: 5_000 }).expect(201);

    const mismatch = await allocate(payment.body.data.id, [
      { invoiceId: otherInvoice, amountMinor: 1_000 },
    ]).expect(422);
    const notOpen = await allocate(payment.body.data.id, [
      { invoiceId: draft.body.data.id, amountMinor: 1_000 },
    ]).expect(422);

    expect(mismatch.body.errorCode).toBe('CUSTOMER_MISMATCH');
    expect(notOpen.body.errorCode).toBe('INVOICE_NOT_OPEN');
  });

  it('detects a duplicate external reference', async () => {
    await recordPayment({ amountMinor: 1_000, reference: 'UTR-555' }).expect(201);

    const res = await recordPayment({ amountMinor: 1_000, reference: 'utr-555' }).expect(409);

    expect(res.body.errorCode).toBe('DUPLICATE_PAYMENT_REFERENCE');
  });

  describe('idempotency', () => {
    it('requires an Idempotency-Key header', async () => {
      const res = await t
        .http()
        .post('/api/v1/payments')
        .set(ctx.headers)
        .send({ customerId, amountMinor: 1_000, method: 'CASH', paymentDate: '2026-11-05' })
        .expect(400);

      expect(res.body.errorCode).toBe('IDEMPOTENCY_KEY_REQUIRED');
    });

    it('replays the original result for a retried request', async () => {
      const key = randomUUID();
      const first = await recordPayment({ amountMinor: 1_000 }, key).expect(201);
      const retry = await recordPayment({ amountMinor: 1_000 }, key).expect(201);

      const list = await t.http().get('/api/v1/payments').set(ctx.headers).expect(200);
      expect(retry.body.data.id).toBe(first.body.data.id);
      expect(list.body.data).toHaveLength(1);
    });

    it('refuses to reuse a key for a different request', async () => {
      const key = randomUUID();
      await recordPayment({ amountMinor: 1_000 }, key).expect(201);

      const res = await recordPayment({ amountMinor: 2_000 }, key).expect(422);

      expect(res.body.errorCode).toBe('IDEMPOTENCY_KEY_REUSED');
    });
  });

  describe('reversals', () => {
    it('reverses one allocation and restores the invoice balance', async () => {
      const inv = await issuedInvoice(10_000);
      const payment = await recordPayment({
        amountMinor: 10_000,
        allocations: [{ invoiceId: inv, amountMinor: 10_000 }],
      }).expect(201);
      const allocationId = payment.body.data.allocations[0].id as string;

      await reverse(payment.body.data.id, { allocationId, reason: 'Wrong invoice' }).expect(201);

      expect(await getInvoice(inv)).toMatchObject({ status: 'ISSUED', allocatedMinor: 0 });
      const detail = await t
        .http()
        .get(`/api/v1/payments/${payment.body.data.id}`)
        .set(ctx.headers)
        .expect(200);
      expect(detail.body.data).toMatchObject({ allocatedMinor: 0, status: 'POSTED' });
      expect(detail.body.data.allocations[0]).toMatchObject({
        status: 'REVERSED',
        reversalReason: 'Wrong invoice',
      });
    });

    it('reverses a whole payment and blocks further allocation', async () => {
      const inv = await issuedInvoice(10_000);
      const payment = await recordPayment({
        amountMinor: 10_000,
        allocations: [{ invoiceId: inv, amountMinor: 6_000 }],
      }).expect(201);

      const res = await reverse(payment.body.data.id, { reason: 'Bounced cheque' }).expect(201);
      const blocked = await allocate(payment.body.data.id, [
        { invoiceId: inv, amountMinor: 1_000 },
      ]).expect(422);

      expect(res.body.data).toMatchObject({ status: 'REVERSED', allocatedMinor: 0 });
      expect(blocked.body.errorCode).toBe('PAYMENT_REVERSED');
      expect(await getInvoice(inv)).toMatchObject({ allocatedMinor: 0 });
    });

    it('allows voiding an invoice only after its allocations are reversed', async () => {
      const inv = await issuedInvoice(10_000);
      const payment = await recordPayment({
        amountMinor: 10_000,
        allocations: [{ invoiceId: inv, amountMinor: 4_000 }],
      }).expect(201);
      const voidIt = () =>
        t
          .http()
          .post(`/api/v1/invoices/${inv}/void`)
          .set(ctx.headers)
          .send({ reason: 'Cancelled order' });

      const blocked = await voidIt().expect(422);
      await reverse(payment.body.data.id, {
        allocationId: payment.body.data.allocations[0].id,
        reason: 'Order cancelled',
      }).expect(201);
      await voidIt().expect(200);

      expect(blocked.body.errorCode).toBe('INVOICE_HAS_ALLOCATIONS');
    });
  });

  it('summarizes a customer account', async () => {
    const inv1 = await issuedInvoice(30_000);
    await issuedInvoice(20_000);
    await recordPayment({
      amountMinor: 35_000,
      allocations: [{ invoiceId: inv1, amountMinor: 30_000 }],
    }).expect(201);

    const res = await t
      .http()
      .get(`/api/v1/customers/${customerId}/summary`)
      .set(ctx.headers)
      .expect(200);

    expect(res.body.data).toMatchObject({
      totalInvoicedMinor: 50_000,
      totalReceivedMinor: 35_000,
      outstandingMinor: 20_000,
      unallocatedMinor: 5_000,
      openInvoices: 1,
    });
  });

  it('lists the allocations applied to an invoice', async () => {
    const inv = await issuedInvoice(10_000);
    await recordPayment({
      amountMinor: 4_000,
      reference: 'A1',
      allocations: [{ invoiceId: inv, amountMinor: 4_000 }],
    }).expect(201);
    await recordPayment({
      amountMinor: 3_000,
      reference: 'A2',
      allocations: [{ invoiceId: inv, amountMinor: 3_000 }],
    }).expect(201);

    const res = await t.http().get(`/api/v1/invoices/${inv}/payments`).set(ctx.headers).expect(200);

    expect(res.body.data).toHaveLength(2);
    expect(res.body.data[0]).toMatchObject({
      amountMinor: expect.any(Number),
      payment: expect.objectContaining({ reference: expect.any(String) }),
    });
  });
});
