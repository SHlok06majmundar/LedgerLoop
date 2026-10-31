import { bearer, registerUser, type AuthedUser } from './helpers';
import { createTestApp, type TestApp } from './test-app';

describe('Organizations', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
  });
  beforeEach(() => t.reset());
  afterAll(() => t.close());

  async function createOrg(owner: AuthedUser, name = 'ABC Traders') {
    const res = await t
      .http()
      .post('/api/v1/organizations')
      .set(bearer(owner))
      .send({ name })
      .expect(201);
    return res.body.data as { id: string; slug: string };
  }

  async function invite(owner: AuthedUser, orgId: string, email: string, role = 'ACCOUNTANT') {
    await t
      .http()
      .post(`/api/v1/organizations/${orgId}/invitations`)
      .set(bearer(owner))
      .send({ email, role })
      .expect(201);
    const match = t.mailer.lastTo(email)?.text.match(/token=([\w-]+)/);
    return match![1]!;
  }

  it('makes the creator the owner of a new organization', async () => {
    const owner = await registerUser(t, 'owner@example.com');

    const org = await createOrg(owner);
    const list = await t.http().get('/api/v1/organizations').set(bearer(owner)).expect(200);

    expect(org).toMatchObject({ name: 'ABC Traders', currency: 'INR', timezone: 'Asia/Kolkata' });
    expect(list.body.data).toEqual([
      expect.objectContaining({
        organization: expect.objectContaining({ id: org.id }),
        role: 'OWNER',
      }),
    ]);
  });

  it('gives organizations with the same name distinct slugs', async () => {
    const owner = await registerUser(t, 'owner@example.com');

    const a = await createOrg(owner, 'Acme');
    const b = await createOrg(owner, 'Acme');

    expect(a.slug).not.toBe(b.slug);
  });

  it('hides an organization from users who are not members', async () => {
    const owner = await registerUser(t, 'owner@example.com');
    const outsider = await registerUser(t, 'outsider@example.com');
    const org = await createOrg(owner);

    const res = await t
      .http()
      .get(`/api/v1/organizations/${org.id}`)
      .set(bearer(outsider))
      .expect(404);

    expect(res.body.errorCode).toBe('ORGANIZATION_NOT_FOUND');
  });

  it('lets only the owner change organization settings', async () => {
    const owner = await registerUser(t, 'owner@example.com');
    const admin = await registerUser(t, 'admin@example.com');
    const org = await createOrg(owner);
    const token = await invite(owner, org.id, 'admin@example.com', 'ADMIN');
    await t
      .http()
      .post('/api/v1/invitations/accept')
      .set(bearer(admin))
      .send({ token })
      .expect(200);

    await t
      .http()
      .patch(`/api/v1/organizations/${org.id}`)
      .set(bearer(admin))
      .send({ name: 'Renamed' })
      .expect(403);
    const res = await t
      .http()
      .patch(`/api/v1/organizations/${org.id}`)
      .set(bearer(owner))
      .send({ name: 'Renamed' })
      .expect(200);

    expect(res.body.data.name).toBe('Renamed');
  });

  describe('invitations', () => {
    it('adds the invited user as a member with the invited role', async () => {
      const owner = await registerUser(t, 'owner@example.com');
      const invitee = await registerUser(t, 'acc@example.com');
      const org = await createOrg(owner);
      const token = await invite(owner, org.id, 'acc@example.com', 'ACCOUNTANT');

      await t
        .http()
        .post('/api/v1/invitations/accept')
        .set(bearer(invitee))
        .send({ token })
        .expect(200);
      const members = await t
        .http()
        .get(`/api/v1/organizations/${org.id}/members`)
        .set(bearer(owner))
        .expect(200);

      expect(members.body.data).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            role: 'ACCOUNTANT',
            user: expect.objectContaining({ email: 'acc@example.com' }),
          }),
        ]),
      );
    });

    it('shows invitation details before sign-in', async () => {
      const owner = await registerUser(t, 'owner@example.com', 'Olivia Owner');
      const org = await createOrg(owner);
      const token = await invite(owner, org.id, 'new@example.com', 'VIEWER');

      const res = await t.http().get(`/api/v1/invitations/preview?token=${token}`).expect(200);

      expect(res.body.data).toEqual({
        organizationName: 'ABC Traders',
        email: 'new@example.com',
        role: 'VIEWER',
        invitedBy: 'Olivia Owner',
        expiresAt: expect.any(String),
      });
    });

    it('cannot be accepted by a different email address', async () => {
      const owner = await registerUser(t, 'owner@example.com');
      const stranger = await registerUser(t, 'stranger@example.com');
      const org = await createOrg(owner);
      const token = await invite(owner, org.id, 'intended@example.com');

      const res = await t
        .http()
        .post('/api/v1/invitations/accept')
        .set(bearer(stranger))
        .send({ token })
        .expect(403);

      expect(res.body.errorCode).toBe('INVITATION_EMAIL_MISMATCH');
    });

    it('cannot be used twice', async () => {
      const owner = await registerUser(t, 'owner@example.com');
      const invitee = await registerUser(t, 'acc@example.com');
      const org = await createOrg(owner);
      const token = await invite(owner, org.id, 'acc@example.com');
      await t
        .http()
        .post('/api/v1/invitations/accept')
        .set(bearer(invitee))
        .send({ token })
        .expect(200);

      const res = await t
        .http()
        .post('/api/v1/invitations/accept')
        .set(bearer(invitee))
        .send({ token })
        .expect(400);

      expect(res.body.errorCode).toBe('INVALID_INVITATION');
    });

    it('cannot be sent by roles without member management', async () => {
      const owner = await registerUser(t, 'owner@example.com');
      const accountant = await registerUser(t, 'acc@example.com');
      const org = await createOrg(owner);
      const token = await invite(owner, org.id, 'acc@example.com', 'ACCOUNTANT');
      await t
        .http()
        .post('/api/v1/invitations/accept')
        .set(bearer(accountant))
        .send({ token })
        .expect(200);

      await t
        .http()
        .post(`/api/v1/organizations/${org.id}/invitations`)
        .set(bearer(accountant))
        .send({ email: 'x@example.com', role: 'VIEWER' })
        .expect(403);
    });
  });

  describe('members', () => {
    async function orgWithMember(role: string) {
      const owner = await registerUser(t, 'owner@example.com');
      const member = await registerUser(t, 'member@example.com');
      const org = await createOrg(owner);
      const token = await invite(owner, org.id, 'member@example.com', role);
      await t
        .http()
        .post('/api/v1/invitations/accept')
        .set(bearer(member))
        .send({ token })
        .expect(200);
      const members = await t
        .http()
        .get(`/api/v1/organizations/${org.id}/members`)
        .set(bearer(owner))
        .expect(200);
      const membership = (members.body.data as { id: string; user: { email: string } }[]).find(
        (m) => m.user.email === 'member@example.com',
      )!;
      return { owner, member, org, memberId: membership.id };
    }

    it('changes a member role', async () => {
      const { owner, org, memberId } = await orgWithMember('STAFF');

      const res = await t
        .http()
        .patch(`/api/v1/organizations/${org.id}/members/${memberId}`)
        .set(bearer(owner))
        .send({ role: 'MANAGER' })
        .expect(200);

      expect(res.body.data.role).toBe('MANAGER');
    });

    it('cuts off a disabled member from the organization', async () => {
      const { owner, member, org, memberId } = await orgWithMember('STAFF');

      await t
        .http()
        .patch(`/api/v1/organizations/${org.id}/members/${memberId}`)
        .set(bearer(owner))
        .send({ status: 'DISABLED' })
        .expect(200);

      await t.http().get(`/api/v1/organizations/${org.id}`).set(bearer(member)).expect(404);
    });

    it('removes a member', async () => {
      const { owner, member, org, memberId } = await orgWithMember('STAFF');

      await t
        .http()
        .delete(`/api/v1/organizations/${org.id}/members/${memberId}`)
        .set(bearer(owner))
        .expect(200);

      await t.http().get(`/api/v1/organizations/${org.id}`).set(bearer(member)).expect(404);
    });

    it('protects the owner membership from changes', async () => {
      const { owner, org } = await orgWithMember('ADMIN');
      const members = await t
        .http()
        .get(`/api/v1/organizations/${org.id}/members`)
        .set(bearer(owner))
        .expect(200);
      const ownerMembership = (members.body.data as { id: string; role: string }[]).find(
        (m) => m.role === 'OWNER',
      )!;

      const res = await t
        .http()
        .delete(`/api/v1/organizations/${org.id}/members/${ownerMembership.id}`)
        .set(bearer(owner))
        .expect(422);

      expect(res.body.errorCode).toBe('OWNER_MEMBERSHIP_PROTECTED');
    });

    it('records membership changes in the audit log', async () => {
      const { owner, org, memberId } = await orgWithMember('STAFF');
      await t
        .http()
        .patch(`/api/v1/organizations/${org.id}/members/${memberId}`)
        .set(bearer(owner))
        .send({ role: 'MANAGER' })
        .expect(200);

      const res = await t
        .http()
        .get('/api/v1/audit-logs?entityType=Membership')
        .set(bearer(owner))
        .set('X-Organization-Id', org.id)
        .expect(200);

      expect(res.body.data[0]).toMatchObject({
        action: 'member.updated',
        before: expect.objectContaining({ role: 'STAFF' }),
        after: expect.objectContaining({ role: 'MANAGER' }),
      });
    });
  });
});
