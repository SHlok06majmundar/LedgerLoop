import { JobQueue } from '../src/jobs/job-queue.service';
import { setupOrg, type OrgContext } from './helpers';
import { createTestApp, type TestApp } from './test-app';

describe('Sending invoices', () => {
  let t: TestApp;
  let ctx: OrgContext;
  let queue: JobQueue;

  beforeAll(async () => {
    t = await createTestApp();
    queue = t.app.get(JobQueue);
  });
  beforeEach(async () => {
    await t.reset();
    ctx = await setupOrg(t);
  });
  afterAll(() => t.close());

  async function issuedInvoice(customer: Record<string, unknown>) {
    const c = await t.http().post('/api/v1/customers').set(ctx.headers).send(customer).expect(201);
    const inv = await t
      .http()
      .post('/api/v1/invoices')
      .set(ctx.headers)
      .send({
        customerId: c.body.data.id,
        issueDate: '2026-11-01',
        items: [{ description: 'Goods', quantityMilli: 1000, unitPriceMinor: 50_000 }],
      })
      .expect(201);
    await t.http().post(`/api/v1/invoices/${inv.body.data.id}/issue`).set(ctx.headers).expect(200);
    return inv.body.data.id as string;
  }

  it('emails the invoice with its PDF and records the delivery', async () => {
    const id = await issuedInvoice({ name: 'Sharma Wholesale', email: 'ap@sharma.in' });

    await t
      .http()
      .post(`/api/v1/invoices/${id}/send`)
      .set(ctx.headers)
      .send({ message: 'Thanks for your business' })
      .expect(202);
    await queue.drain();

    const mail = t.mailer.lastTo('ap@sharma.in')!;
    expect(mail.subject).toBe('Invoice INV-2026-0001 from ABC Traders');
    expect(mail.text).toContain('Thanks for your business');
    expect(mail.attachments?.[0]?.filename).toBe('INV-2026-0001.pdf');
    const log = await t
      .http()
      .get(`/api/v1/communications?invoiceId=${id}`)
      .set(ctx.headers)
      .expect(200);
    expect(log.body.data[0]).toMatchObject({ kind: 'INVOICE', status: 'SENT', to: 'ap@sharma.in' });
    const invoice = await t.http().get(`/api/v1/invoices/${id}`).set(ctx.headers).expect(200);
    expect(invoice.body.data.sentAt).toEqual(expect.any(String));
  });

  it('needs an email address for the customer', async () => {
    const id = await issuedInvoice({ name: 'No Email Co' });

    const res = await t
      .http()
      .post(`/api/v1/invoices/${id}/send`)
      .set(ctx.headers)
      .send({})
      .expect(422);

    expect(res.body.errorCode).toBe('CUSTOMER_EMAIL_MISSING');
  });

  it('marks a failed delivery and lets it be retried', async () => {
    const id = await issuedInvoice({ name: 'Flaky Mail', email: 'ap@flaky.in' });
    const send = jest.spyOn(t.mailer, 'send').mockRejectedValue(new Error('SMTP down'));
    await t.http().post(`/api/v1/invoices/${id}/send`).set(ctx.headers).send({}).expect(202);
    await queue.drain();

    const failed = await t
      .http()
      .get('/api/v1/communications?status=FAILED')
      .set(ctx.headers)
      .expect(200);
    expect(failed.body.data[0]).toMatchObject({ lastError: 'SMTP down' });

    send.mockRestore();
    await t
      .http()
      .post(`/api/v1/communications/${failed.body.data[0].id}/retry`)
      .set(ctx.headers)
      .expect(200);
    await queue.drain();

    expect(t.mailer.lastTo('ap@flaky.in')).toBeDefined();
  });
});
