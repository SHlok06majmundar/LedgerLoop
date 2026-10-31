import { addMember, setupOrg, type OrgContext } from './helpers';
import { createTestApp, type TestApp } from './test-app';

describe('Customers', () => {
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

  const create = (body: Record<string, unknown>, headers = ctx.headers) =>
    t.http().post('/api/v1/customers').set(headers).send(body);

  it('creates a customer with defaults', async () => {
    const res = await create({
      name: 'Sharma Wholesale',
      email: 'Accounts@Sharma.in',
      gstin: '27aapfu0939f1zv',
    }).expect(201);

    expect(res.body.data).toMatchObject({
      name: 'Sharma Wholesale',
      email: 'accounts@sharma.in',
      gstin: '27AAPFU0939F1ZV',
      paymentTermsDays: 30,
      archivedAt: null,
    });
  });

  it('rejects an invalid GSTIN', async () => {
    const res = await create({ name: 'Bad Tax', gstin: '1234' }).expect(400);

    expect(res.body.details[0].field).toBe('gstin');
  });

  it('requires the organization header', async () => {
    const { 'X-Organization-Id': _omit, ...withoutOrg } = ctx.headers;

    const res = await create({ name: 'No Org' }, withoutOrg).expect(400);

    expect(res.body.errorCode).toBe('ORGANIZATION_REQUIRED');
  });

  it('lists customers with search and pagination', async () => {
    for (const name of ['Alpha Traders', 'Beta Supplies', 'Alpha Retail']) {
      await create({ name }).expect(201);
    }

    const res = await t
      .http()
      .get('/api/v1/customers?search=alpha&limit=1')
      .set(ctx.headers)
      .expect(200);

    expect(res.body.data).toHaveLength(1);
    expect(res.body.meta).toEqual({ page: 1, limit: 1, total: 2, totalPages: 2 });
  });

  it('updates a customer', async () => {
    const created = await create({ name: 'Old Name' }).expect(201);

    const res = await t
      .http()
      .patch(`/api/v1/customers/${created.body.data.id}`)
      .set(ctx.headers)
      .send({ name: 'New Name', paymentTermsDays: 15 })
      .expect(200);

    expect(res.body.data).toMatchObject({ name: 'New Name', paymentTermsDays: 15 });
  });

  it('archives instead of deleting, and hides archived customers by default', async () => {
    const created = await create({ name: 'Gone Soon' }).expect(201);
    const id = created.body.data.id as string;

    await t.http().delete(`/api/v1/customers/${id}`).set(ctx.headers).expect(200);

    const active = await t.http().get('/api/v1/customers').set(ctx.headers).expect(200);
    const archived = await t
      .http()
      .get('/api/v1/customers?status=archived')
      .set(ctx.headers)
      .expect(200);
    const detail = await t.http().get(`/api/v1/customers/${id}`).set(ctx.headers).expect(200);
    expect(active.body.data).toHaveLength(0);
    expect(archived.body.data).toHaveLength(1);
    expect(detail.body.data.archivedAt).toEqual(expect.any(String));
  });

  it("never exposes another organization's customer, even by id", async () => {
    const created = await create({ name: 'Private Co' }).expect(201);
    const other = await setupOrg(t, 'rival@example.com', 'Rival Ltd');

    await t.http().get(`/api/v1/customers/${created.body.data.id}`).set(other.headers).expect(404);
    await t
      .http()
      .patch(`/api/v1/customers/${created.body.data.id}`)
      .set(other.headers)
      .send({ name: 'Hijacked' })
      .expect(404);
    const list = await t.http().get('/api/v1/customers').set(other.headers).expect(200);
    expect(list.body.data).toHaveLength(0);
  });

  it('rejects a header for an organization the caller does not belong to', async () => {
    const other = await setupOrg(t, 'rival@example.com', 'Rival Ltd');

    await t
      .http()
      .get('/api/v1/customers')
      .set({ ...ctx.headers, 'X-Organization-Id': other.orgId })
      .expect(404);
  });

  it('lets viewers read but not write', async () => {
    const viewer = await addMember(t, ctx, 'viewer@example.com', 'VIEWER');

    await t.http().get('/api/v1/customers').set(viewer).expect(200);
    const res = await create({ name: 'Nope' }, viewer).expect(403);
    expect(res.body.errorCode).toBe('INSUFFICIENT_ROLE');
  });
});
