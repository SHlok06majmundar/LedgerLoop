import { randomUUID } from 'node:crypto';
import { JobQueue } from '../src/jobs/job-queue.service';
import { addMember, setupOrg, type OrgContext } from './helpers';
import { createTestApp, type TestApp } from './test-app';

interface Line {
  date: string;
  narration: string;
  ref?: string;
  credit: string;
}

describe('Reconciliation', () => {
  let t: TestApp;
  let ctx: OrgContext;
  let queue: JobQueue;
  let abc: string;

  beforeAll(async () => {
    t = await createTestApp();
    queue = t.app.get(JobQueue);
  });
  beforeEach(async () => {
    await t.reset();
    ctx = await setupOrg(t);
    abc = await customer('ABC Traders');
  });
  afterAll(() => t.close());

  async function customer(name: string) {
    const res = await t
      .http()
      .post('/api/v1/customers')
      .set(ctx.headers)
      .send({ name })
      .expect(201);
    return res.body.data.id as string;
  }

  async function invoice(customerId: string, amountMinor: number, issueDate = '2026-11-01') {
    const res = await t
      .http()
      .post('/api/v1/invoices')
      .set(ctx.headers)
      .send({
        customerId,
        issueDate,
        dueDate: '2099-01-01',
        items: [{ description: 'Goods', quantityMilli: 1000, unitPriceMinor: amountMinor }],
      })
      .expect(201);
    await t.http().post(`/api/v1/invoices/${res.body.data.id}/issue`).set(ctx.headers).expect(200);
    return { id: res.body.data.id as string, number: res.body.data.invoiceNumber as string };
  }

  async function importLines(lines: Line[]) {
    const csv = [
      'Date,Narration,Ref,Withdrawal,Deposit',
      ...lines.map((l) => `${l.date},${l.narration},${l.ref ?? ''},,${l.credit}`),
    ].join('\n');
    const up = await t
      .http()
      .post('/api/v1/bank-imports')
      .set(ctx.headers)
      .attach('file', Buffer.from(csv), { filename: 's.csv', contentType: 'text/csv' })
      .expect(201);
    await t
      .http()
      .post(`/api/v1/bank-imports/${up.body.data.id}/confirm`)
      .set(ctx.headers)
      .send({
        mapping: {
          date: 'Date',
          description: 'Narration',
          reference: 'Ref',
          debit: 'Withdrawal',
          credit: 'Deposit',
        },
        dateFormat: 'DD/MM/YYYY',
      })
      .expect(200);
    await queue.drain();
  }

  const txns = async () =>
    (await t.http().get('/api/v1/bank-transactions').set(ctx.headers).expect(200)).body.data;
  const getInvoice = async (id: string) =>
    (await t.http().get(`/api/v1/invoices/${id}`).set(ctx.headers).expect(200)).body.data;
  const exceptions = async (status = 'OPEN') =>
    (
      await t
        .http()
        .get(`/api/v1/reconciliation/exceptions?status=${status}`)
        .set(ctx.headers)
        .expect(200)
    ).body.data;
  const matches = async (status: string) =>
    (
      await t
        .http()
        .get(`/api/v1/reconciliation/matches?status=${status}`)
        .set(ctx.headers)
        .expect(200)
    ).body.data;

  it('auto-matches a recorded payment by bank reference after an import', async () => {
    await t
      .http()
      .post('/api/v1/payments')
      .set(ctx.headers)
      .set('Idempotency-Key', randomUUID())
      .send({
        customerId: abc,
        amountMinor: 2_500_000,
        method: 'NEFT',
        reference: 'UTR0001',
        paymentDate: '2026-11-05',
      })
      .expect(201);

    await importLines([
      { date: '05/11/2026', narration: 'NEFT CR ABC TRADERS', ref: 'UTR0001', credit: '25000.00' },
    ]);

    const [txn] = await txns();
    expect(txn).toMatchObject({ status: 'MATCHED', paymentId: expect.any(String) });
    expect(await exceptions()).toHaveLength(0);
    const run = (await t.http().get('/api/v1/reconciliation/runs').set(ctx.headers).expect(200))
      .body.data[0];
    expect(run).toMatchObject({
      status: 'COMPLETED',
      trigger: 'IMPORT',
      stats: expect.objectContaining({ matched: 1 }),
    });
  });

  it('suggests a direct invoice payment and applies it on approval', async () => {
    const inv = await invoice(abc, 4_000_000);
    await importLines([
      { date: '05/11/2026', narration: `NEFT ABC TRADERS ${inv.number}`, credit: '40000.00' },
    ]);

    const [suggestion] = await matches('SUGGESTED');
    expect(suggestion).toMatchObject({ kind: 'INVOICE', score: expect.any(Number) });
    expect(suggestion.signals.map((s: { code: string }) => s.code)).toContain('INVOICE_REFERENCE');
    expect(await exceptions()).toHaveLength(1);

    await t
      .http()
      .post(`/api/v1/reconciliation/matches/${suggestion.id}/approve`)
      .set(ctx.headers)
      .expect(200);

    expect(await getInvoice(inv.id)).toMatchObject({ status: 'PAID', outstandingMinor: 0 });
    expect((await txns())[0]).toMatchObject({ status: 'MATCHED' });
    expect(await exceptions()).toHaveLength(0);
    const resolved = await exceptions('RESOLVED');
    expect(resolved[0]).toMatchObject({
      resolution: 'MATCHED',
      resolutionMinutes: expect.any(Number),
    });
  });

  it('suggests one transfer covering several invoices of the named customer', async () => {
    const a = await invoice(abc, 1_000_000);
    const b = await invoice(abc, 1_500_000);
    await invoice(abc, 9_900_000);
    await importLines([
      {
        date: '02/11/2026',
        narration: `RTGS ABC TRADERS ${a.number} ${b.number}`,
        credit: '25000.00',
      },
    ]);

    const [suggestion] = await matches('SUGGESTED');
    expect(suggestion).toMatchObject({ kind: 'INVOICE_GROUP' });

    await t
      .http()
      .post(`/api/v1/reconciliation/matches/${suggestion.id}/approve`)
      .set(ctx.headers)
      .expect(200);

    expect(await getInvoice(a.id)).toMatchObject({ status: 'PAID' });
    expect(await getInvoice(b.id)).toMatchObject({ status: 'PAID' });
  });

  it('does not suggest a rejected candidate again', async () => {
    const inv = await invoice(abc, 4_000_000);
    await importLines([
      { date: '05/11/2026', narration: `NEFT ABC TRADERS ${inv.number}`, credit: '40000.00' },
    ]);
    const [suggestion] = await matches('SUGGESTED');

    await t
      .http()
      .post(`/api/v1/reconciliation/matches/${suggestion.id}/reject`)
      .set(ctx.headers)
      .send({ reason: 'Different customer branch' })
      .expect(200);
    await t.http().post('/api/v1/reconciliation/runs').set(ctx.headers).expect(202);
    await queue.drain();

    expect(await matches('SUGGESTED')).toHaveLength(0);
    expect((await txns())[0]).toMatchObject({ status: 'UNMATCHED' });
    expect(await exceptions()).toHaveLength(1);
  });

  it('flags a discrepancy when the referenced payment amount differs', async () => {
    await t
      .http()
      .post('/api/v1/payments')
      .set(ctx.headers)
      .set('Idempotency-Key', randomUUID())
      .send({
        customerId: abc,
        amountMinor: 2_500_000,
        method: 'NEFT',
        reference: 'UTR0009',
        paymentDate: '2026-11-05',
      })
      .expect(201);

    await importLines([
      { date: '05/11/2026', narration: 'NEFT ABC TRADERS', ref: 'UTR0009', credit: '24000.00' },
    ]);

    expect((await txns())[0]).toMatchObject({ status: 'DISCREPANCY' });
    expect((await exceptions())[0]).toMatchObject({ reason: 'DISCREPANCY' });
  });

  it('manually matches an unmatched transfer to invoices', async () => {
    const inv = await invoice(abc, 3_000_000);
    await importLines([
      { date: '09/11/2026', narration: 'CASH DEPOSIT BRANCH 004', credit: '30000.00' },
    ]);
    const [txn] = await txns();

    await t
      .http()
      .post(`/api/v1/reconciliation/transactions/${txn.id}/manual-match`)
      .set(ctx.headers)
      .send({ customerId: abc, allocations: [{ invoiceId: inv.id, amountMinor: 3_000_000 }] })
      .expect(200);

    expect(await getInvoice(inv.id)).toMatchObject({ status: 'PAID' });
    expect((await txns())[0]).toMatchObject({ status: 'MATCHED' });
    expect(await exceptions()).toHaveLength(0);
  });

  it('assigns, comments on and ignores an exception', async () => {
    const manager = await addMember(t, ctx, 'manager@example.com', 'MANAGER');
    await importLines([{ date: '09/11/2026', narration: 'INTEREST CREDIT', credit: '12.00' }]);
    const [exception] = await exceptions();

    await t
      .http()
      .patch(`/api/v1/reconciliation/exceptions/${exception.id}`)
      .set(ctx.headers)
      .send({ assigneeId: ctx.owner.id, comment: 'Bank interest, not a customer payment' })
      .expect(200);
    await t
      .http()
      .post(`/api/v1/reconciliation/exceptions/${exception.id}/ignore`)
      .set(manager)
      .send({ reason: 'Bank interest' })
      .expect(200);

    const [resolved] = await exceptions('RESOLVED');
    expect(resolved).toMatchObject({
      resolution: 'IGNORED',
      assigneeId: expect.objectContaining({ id: ctx.owner.id }),
    });
    expect(resolved.comments[0]).toMatchObject({ body: 'Bank interest, not a customer payment' });
    expect((await txns())[0]).toMatchObject({ status: 'IGNORED' });
  });

  it('only lets approvers decide matches', async () => {
    const staff = await addMember(t, ctx, 'staff@example.com', 'STAFF');
    const inv = await invoice(abc, 4_000_000);
    await importLines([
      { date: '05/11/2026', narration: `NEFT ABC TRADERS ${inv.number}`, credit: '40000.00' },
    ]);
    const [suggestion] = await matches('SUGGESTED');

    await t
      .http()
      .post(`/api/v1/reconciliation/matches/${suggestion.id}/approve`)
      .set(staff)
      .expect(403);
  });
});
