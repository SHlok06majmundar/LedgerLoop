import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { setupOrg, type OrgContext } from './helpers';
import { createTestApp, type TestApp } from './test-app';

// Smallest valid PNG (1x1 transparent pixel).
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);

describe('Documents and uploads', () => {
  let t: TestApp;
  let ctx: OrgContext;

  beforeAll(async () => {
    t = await createTestApp();
  });
  beforeEach(async () => {
    await t.reset();
    ctx = await setupOrg(t);
  });
  afterAll(() => t.close());

  it('uploads an organization logo and serves it back to members', async () => {
    await t
      .http()
      .post(`/api/v1/organizations/${ctx.orgId}/logo`)
      .set(ctx.headers)
      .attach('file', PNG, { filename: 'logo.png', contentType: 'image/png' })
      .expect(201);

    const res = await t
      .http()
      .get(`/api/v1/organizations/${ctx.orgId}/logo`)
      .set(ctx.headers)
      .expect(200);

    expect(res.headers['content-type']).toBe('image/png');
    expect(Buffer.from(res.body as Buffer).equals(PNG)).toBe(true);
  });

  it('rejects logos that are not PNG or JPEG', async () => {
    const res = await t
      .http()
      .post(`/api/v1/organizations/${ctx.orgId}/logo`)
      .set(ctx.headers)
      .attach('file', Buffer.from('<svg/>'), { filename: 'logo.svg', contentType: 'image/svg+xml' })
      .expect(422);

    expect(res.body.errorCode).toBe('UNSUPPORTED_IMAGE');
  });

  it('downloads an invoice PDF and keeps a copy in the upload folder', async () => {
    const customer = await t
      .http()
      .post('/api/v1/customers')
      .set(ctx.headers)
      .send({ name: 'Sharma Wholesale' })
      .expect(201);
    const invoice = await t
      .http()
      .post('/api/v1/invoices')
      .set(ctx.headers)
      .send({
        customerId: customer.body.data.id,
        issueDate: '2026-11-01',
        items: [{ description: 'Goods', quantityMilli: 1000, unitPriceMinor: 10_000 }],
      })
      .expect(201);
    const id = invoice.body.data.id as string;

    const res = await t
      .http()
      .get(`/api/v1/invoices/${id}/pdf`)
      .set(ctx.headers)
      .buffer(true)
      .parse((r, cb) => {
        const chunks: Buffer[] = [];
        r.on('data', (c: Buffer) => chunks.push(c));
        r.on('end', () => cb(null, Buffer.concat(chunks)));
      })
      .expect(200);

    expect(res.headers['content-type']).toBe('application/pdf');
    expect(res.headers['content-disposition']).toContain('INV-2026-0001.pdf');
    expect((res.body as Buffer).subarray(0, 5).toString()).toBe('%PDF-');
    const stored = join(process.env.UPLOAD_DIR!, 'orgs', ctx.orgId, 'invoices', `${id}.pdf`);
    expect(existsSync(stored)).toBe(true);
  });
});
