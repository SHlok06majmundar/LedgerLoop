import { JobQueue } from '../src/jobs/job-queue.service';
import { addDays, todayIn } from '../src/modules/invoices/domain/invoice-status';
import { setupOrg, type OrgContext } from './helpers';
import { createTestApp, type TestApp } from './test-app';

describe('Collections', () => {
  let t: TestApp;
  let ctx: OrgContext;
  let queue: JobQueue;
  const today = () => todayIn('Asia/Kolkata');

  beforeAll(async () => {
    t = await createTestApp();
    queue = t.app.get(JobQueue);
  });
  beforeEach(async () => {
    await t.reset();
    ctx = await setupOrg(t);
  });
  afterAll(() => t.close());

  async function openInvoice(customer: Record<string, unknown>, dueInDays: number) {
    const c = await t.http().post('/api/v1/customers').set(ctx.headers).send(customer).expect(201);
    const issueDate = addDays(today(), Math.min(dueInDays, 0) - 30);
    const inv = await t
      .http()
      .post('/api/v1/invoices')
      .set(ctx.headers)
      .send({
        customerId: c.body.data.id,
        issueDate,
        dueDate: addDays(today(), dueInDays),
        items: [{ description: 'Goods', quantityMilli: 1000, unitPriceMinor: 10_000 }],
      })
      .expect(201);
    await t.http().post(`/api/v1/invoices/${inv.body.data.id}/issue`).set(ctx.headers).expect(200);
    return { invoiceId: inv.body.data.id as string, customerId: c.body.data.id as string };
  }

  const run = async () => {
    const res = await t.http().post('/api/v1/collections/run').set(ctx.headers).expect(200);
    await queue.drain();
    return res.body.data.queued as number;
  };

  it('starts with the default reminder schedule', async () => {
    const res = await t.http().get('/api/v1/collections/settings').set(ctx.headers).expect(200);

    expect(res.body.data).toMatchObject({ enabled: true, sendHour: 10 });
    expect(res.body.data.rules.map((r: { offsetDays: number }) => r.offsetDays)).toEqual([
      -3, 0, 3, 7, 15,
    ]);
  });

  it('sends the overdue reminder an invoice has reached, only once', async () => {
    await openInvoice({ name: 'Late Payer', email: 'ap@late.in' }, -4);

    expect(await run()).toBe(1);
    expect(await run()).toBe(0);

    const mail = t.mailer.lastTo('ap@late.in')!;
    expect(mail.subject).toMatch(/^Payment overdue: INV-/);
    const list = await t.http().get('/api/v1/collections/reminders').set(ctx.headers).expect(200);
    expect(list.body.data).toHaveLength(1);
    expect(list.body.data[0]).toMatchObject({ kind: 'OVERDUE', status: 'SENT' });
  });

  it('respects customer preferences and paused invoices', async () => {
    await openInvoice({ name: 'Opted Out', email: 'no@mail.in', remindersEnabled: false }, -4);
    const paused = await openInvoice({ name: 'Paused', email: 'p@mail.in' }, -4);
    await t
      .http()
      .post(`/api/v1/collections/invoices/${paused.invoiceId}/pause`)
      .set(ctx.headers)
      .expect(200);

    expect(await run()).toBe(0);
  });

  it('does not remind about invoices that are not due soon', async () => {
    await openInvoice({ name: 'Early', email: 'e@mail.in' }, 20);

    expect(await run()).toBe(0);
  });

  it('follows a custom schedule', async () => {
    await openInvoice({ name: 'Custom', email: 'c@mail.in' }, -2);
    await t
      .http()
      .put('/api/v1/collections/settings')
      .set(ctx.headers)
      .send({ enabled: true, sendHour: 9, rules: [{ offsetDays: 1, kind: 'OVERDUE' }] })
      .expect(200);

    expect(await run()).toBe(1);
  });

  it('sends a manual reminder with a personal note', async () => {
    const { invoiceId } = await openInvoice({ name: 'Manual', email: 'm@mail.in' }, 5);

    await t
      .http()
      .post('/api/v1/collections/reminders')
      .set(ctx.headers)
      .send({ invoiceIds: [invoiceId], message: 'Please clear this before Diwali' })
      .expect(201);
    await queue.drain();

    expect(t.mailer.lastTo('m@mail.in')?.text).toContain('Please clear this before Diwali');
  });

  it('holds a scheduled reminder until sent now, and can cancel others', async () => {
    const { invoiceId } = await openInvoice({ name: 'Scheduled', email: 's@mail.in' }, 5);
    const later = new Date(Date.now() + 86_400_000).toISOString();
    const a = await t
      .http()
      .post('/api/v1/collections/reminders')
      .set(ctx.headers)
      .send({ invoiceIds: [invoiceId], scheduledAt: later })
      .expect(201);
    const b = await t
      .http()
      .post('/api/v1/collections/reminders')
      .set(ctx.headers)
      .send({ invoiceIds: [invoiceId], scheduledAt: later })
      .expect(201);
    await queue.drain();
    expect(t.mailer.lastTo('s@mail.in')).toBeUndefined();

    await t
      .http()
      .post(`/api/v1/collections/reminders/${a.body.data.id}/send`)
      .set(ctx.headers)
      .expect(200);
    await t
      .http()
      .patch(`/api/v1/collections/reminders/${b.body.data.id}`)
      .set(ctx.headers)
      .send({ status: 'CANCELLED' })
      .expect(200);
    await queue.drain();

    expect(t.mailer.outbox.filter((m) => m.to === 's@mail.in')).toHaveLength(1);
  });
});
