import { JobQueue } from '../src/jobs/job-queue.service';
import { addMember, bearer, setupOrg, type OrgContext } from './helpers';
import { createTestApp, type TestApp } from './test-app';

describe('Notifications', () => {
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

  it('tells the uploader when a statement import finishes', async () => {
    const csv = 'Date,Narration,Amount\n05/11/2026,INTEREST,10.00\n';
    const up = await t
      .http()
      .post('/api/v1/bank-imports')
      .set(ctx.headers)
      .attach('file', Buffer.from(csv), { filename: 'nov.csv', contentType: 'text/csv' })
      .expect(201);
    await t
      .http()
      .post(`/api/v1/bank-imports/${up.body.data.id}/confirm`)
      .set(ctx.headers)
      .send({
        mapping: { date: 'Date', description: 'Narration', amount: 'Amount' },
        dateFormat: 'DD/MM/YYYY',
      })
      .expect(200);
    await t.app.get(JobQueue).drain();

    const res = await t.http().get('/api/v1/notifications').set(bearer(ctx.owner)).expect(200);

    expect(res.body.data[0]).toMatchObject({
      type: 'import.completed',
      title: 'Statement nov.csv imported',
      readAt: null,
    });
    expect(res.body.meta.unread).toBe(1);
  });

  it('marks notifications read', async () => {
    const member = await addMember(t, ctx, 'acc@example.com', 'ACCOUNTANT');
    const csv = 'Date,Narration,Amount\n05/11/2026,UNKNOWN,10.00\n';
    const up = await t
      .http()
      .post('/api/v1/bank-imports')
      .set(member)
      .attach('file', Buffer.from(csv), { filename: 'x.csv', contentType: 'text/csv' })
      .expect(201);
    await t
      .http()
      .post(`/api/v1/bank-imports/${up.body.data.id}/confirm`)
      .set(member)
      .send({
        mapping: { date: 'Date', description: 'Narration', amount: 'Amount' },
        dateFormat: 'DD/MM/YYYY',
      })
      .expect(200);
    await t.app.get(JobQueue).drain();
    const [exception] = (
      await t.http().get('/api/v1/reconciliation/exceptions').set(ctx.headers).expect(200)
    ).body.data;
    const memberId = (
      await t.http().get('/api/v1/auth/me').set({ Authorization: member.Authorization }).expect(200)
    ).body.data.id;
    await t
      .http()
      .patch(`/api/v1/reconciliation/exceptions/${exception.id}`)
      .set(ctx.headers)
      .send({ assigneeId: memberId })
      .expect(200);

    const auth = { Authorization: member.Authorization };
    const list = await t.http().get('/api/v1/notifications?unread=true').set(auth).expect(200);
    expect(list.body.data.map((n: { type: string }) => n.type)).toEqual([
      'exception.assigned',
      'import.completed',
    ]);

    await t.http().post('/api/v1/notifications/read-all').set(auth).expect(200);
    const after = await t.http().get('/api/v1/notifications').set(auth).expect(200);
    expect(after.body.meta.unread).toBe(0);
  });
});
