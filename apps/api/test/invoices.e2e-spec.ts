import { addMember, setupOrg, type OrgContext } from './helpers';
import { createTestApp, type TestApp } from './test-app';

describe('Invoices', () => {
  let t: TestApp;
  let ctx: OrgContext;
  let customerId: string;

  beforeAll(async () => {
    t = await createTestApp();
  });
  beforeEach(async () => {
    await t.reset();
    ctx = await setupOrg(t);
    const customer = await t
      .http()
      .post('/api/v1/customers')
      .set(ctx.headers)
      .send({ name: 'Sharma Wholesale', email: 'ap@sharma.in', paymentTermsDays: 15 })
      .expect(201);
    customerId = customer.body.data.id;
  });
  afterAll(() => t.close());

  const draft = (overrides: Record<string, unknown> = {}, headers = ctx.headers) =>
    t
      .http()
      .post('/api/v1/invoices')
      .set(headers)
      .send({
        customerId,
        issueDate: '2026-11-01',
        items: [
          {
            description: 'Steel rods',
            quantityMilli: 2000,
            unitPriceMinor: 100_000,
            taxRateBps: 1800,
          },
          {
            description: 'Delivery',
            quantityMilli: 1000,
            unitPriceMinor: 50_000,
            discountMinor: 10_000,
          },
        ],
        ...overrides,
      });

  const issue = (id: string, headers = ctx.headers) =>
    t.http().post(`/api/v1/invoices/${id}/issue`).set(headers);

  it('creates a numbered draft with exact totals and a due date from customer terms', async () => {
    const res = await draft().expect(201);

    expect(res.body.data).toMatchObject({
      invoiceNumber: 'INV-2026-0001',
      status: 'DRAFT',
      dueDate: '2026-11-16',
      subtotalMinor: 250_000,
      discountMinor: 10_000,
      taxMinor: 36_000,
      totalMinor: 276_000,
      allocatedMinor: 0,
      outstandingMinor: 276_000,
    });
    expect(res.body.data.items[0]).toMatchObject({
      amountMinor: 200_000,
      taxMinor: 36_000,
      totalMinor: 236_000,
    });
  });

  it('numbers invoices sequentially per organization', async () => {
    await draft().expect(201);
    const second = await draft().expect(201);
    const other = await setupOrg(t, 'rival@example.com', 'Rival');
    const rivalCustomer = await t
      .http()
      .post('/api/v1/customers')
      .set(other.headers)
      .send({ name: 'Rival Customer' })
      .expect(201);
    const rivalInvoice = await draft(
      { customerId: rivalCustomer.body.data.id },
      other.headers,
    ).expect(201);

    expect(second.body.data.invoiceNumber).toBe('INV-2026-0002');
    expect(rivalInvoice.body.data.invoiceNumber).toBe('INV-2026-0001');
  });

  it('rejects a due date before the issue date', async () => {
    const res = await draft({ dueDate: '2026-10-01' }).expect(400);

    expect(res.body.details[0].field).toBe('dueDate');
  });

  it('cannot bill a customer from another organization', async () => {
    const other = await setupOrg(t, 'rival@example.com', 'Rival');

    const res = await draft({}, other.headers).expect(404);

    expect(res.body.errorCode).toBe('CUSTOMER_NOT_FOUND');
  });

  it('cannot bill an archived customer', async () => {
    await t.http().delete(`/api/v1/customers/${customerId}`).set(ctx.headers).expect(200);

    const res = await draft().expect(422);

    expect(res.body.errorCode).toBe('CUSTOMER_ARCHIVED');
  });

  it('recalculates totals when a draft is edited', async () => {
    const created = await draft().expect(201);

    const res = await t
      .http()
      .patch(`/api/v1/invoices/${created.body.data.id}`)
      .set(ctx.headers)
      .send({ items: [{ description: 'Only line', quantityMilli: 1000, unitPriceMinor: 99_900 }] })
      .expect(200);

    expect(res.body.data).toMatchObject({ totalMinor: 99_900, invoiceNumber: 'INV-2026-0001' });
  });

  it('issues a draft and then locks it against edits', async () => {
    const created = await draft().expect(201);
    const id = created.body.data.id as string;

    const issued = await issue(id).expect(200);
    const edit = await t
      .http()
      .patch(`/api/v1/invoices/${id}`)
      .set(ctx.headers)
      .send({ notes: 'too late' })
      .expect(422);

    expect(issued.body.data.status).toMatch(/ISSUED|OVERDUE/);
    expect(issued.body.data.customerSnapshot).toMatchObject({ name: 'Sharma Wholesale' });
    expect(edit.body.errorCode).toBe('INVOICE_NOT_EDITABLE');
  });

  it('lets staff draft invoices but not issue them', async () => {
    const staff = await addMember(t, ctx, 'staff@example.com', 'STAFF');
    const created = await draft({}, staff).expect(201);

    await issue(created.body.data.id, staff).expect(403);
  });

  it('voids an unpaid invoice with a reason, once', async () => {
    const created = await draft().expect(201);
    const id = created.body.data.id as string;
    await issue(id).expect(200);

    const voided = await t
      .http()
      .post(`/api/v1/invoices/${id}/void`)
      .set(ctx.headers)
      .send({ reason: 'Raised in error' })
      .expect(200);
    const again = await t
      .http()
      .post(`/api/v1/invoices/${id}/void`)
      .set(ctx.headers)
      .send({ reason: 'Again' })
      .expect(422);

    expect(voided.body.data).toMatchObject({ status: 'VOID', voidReason: 'Raised in error' });
    expect(again.body.errorCode).toBe('INVOICE_NOT_VOIDABLE');
  });

  it('deletes a draft, but an issued invoice can only be voided', async () => {
    const first = await draft().expect(201);
    const second = await draft().expect(201);
    await issue(second.body.data.id).expect(200);

    await t.http().delete(`/api/v1/invoices/${first.body.data.id}`).set(ctx.headers).expect(200);
    const issued = await t
      .http()
      .delete(`/api/v1/invoices/${second.body.data.id}`)
      .set(ctx.headers)
      .expect(422);

    await t.http().get(`/api/v1/invoices/${first.body.data.id}`).set(ctx.headers).expect(404);
    expect(issued.body.errorCode).toBe('INVOICE_NOT_DELETABLE');
  });

  it('filters the list by status and customer', async () => {
    const a = await draft().expect(201);
    await draft().expect(201);
    await issue(a.body.data.id).expect(200);

    const drafts = await t.http().get('/api/v1/invoices?status=DRAFT').set(ctx.headers).expect(200);
    const forCustomer = await t
      .http()
      .get(`/api/v1/invoices?customerId=${customerId}`)
      .set(ctx.headers)
      .expect(200);

    expect(drafts.body.data).toHaveLength(1);
    expect(forCustomer.body.meta.total).toBe(2);
  });

  it('marks issued invoices past their due date as overdue', async () => {
    const created = await draft({ issueDate: '2025-01-01', dueDate: '2025-01-31' }).expect(201);

    const issued = await issue(created.body.data.id).expect(200);

    expect(issued.body.data.status).toBe('OVERDUE');
  });
});
