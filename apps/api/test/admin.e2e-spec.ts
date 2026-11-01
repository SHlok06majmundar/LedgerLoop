import { getModelToken } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import { User } from '../src/modules/users/user.schema';
import { addMember, bearer, PASSWORD, registerUser, setupOrg } from './helpers';
import { createTestApp, type TestApp } from './test-app';

describe('Super Admin', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
  });
  beforeEach(() => t.reset());
  afterAll(() => t.close());

  async function superAdmin() {
    const admin = await registerUser(t, 'root@ledgerloop.app', 'Platform Admin');
    await t.app
      .get<Model<User>>(getModelToken(User.name))
      .updateOne({ _id: admin.id }, { isSuperAdmin: true });
    return admin;
  }

  it('is closed to ordinary users', async () => {
    const user = await registerUser(t, 'user@example.com');

    const res = await t.http().get('/api/v1/admin/stats').set(bearer(user)).expect(403);

    expect(res.body.errorCode).toBe('SUPER_ADMIN_ONLY');
  });

  it('shows platform totals and every organization', async () => {
    const admin = await superAdmin();
    await setupOrg(t, 'a@example.com', 'Alpha Co');
    await setupOrg(t, 'b@example.com', 'Beta Co');

    const stats = await t.http().get('/api/v1/admin/stats').set(bearer(admin)).expect(200);
    const orgs = await t
      .http()
      .get('/api/v1/admin/organizations?search=co')
      .set(bearer(admin))
      .expect(200);

    expect(stats.body.data).toMatchObject({ organizations: 2, users: 3 });
    expect(orgs.body.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'Alpha Co', members: 1, isSuspended: false }),
      ]),
    );
  });

  it('suspends an organization, cutting off its members', async () => {
    const admin = await superAdmin();
    const org = await setupOrg(t, 'a@example.com', 'Alpha Co');

    await t
      .http()
      .patch(`/api/v1/admin/organizations/${org.orgId}`)
      .set(bearer(admin))
      .send({ isSuspended: true })
      .expect(200);

    await t.http().get('/api/v1/customers').set(org.headers).expect(404);
  });

  it('deactivates a user and ends their sessions', async () => {
    const admin = await superAdmin();
    const user = await registerUser(t, 'user@example.com');

    await t
      .http()
      .patch(`/api/v1/admin/users/${user.id}`)
      .set(bearer(admin))
      .send({ isActive: false })
      .expect(200);

    await t.http().get('/api/v1/auth/me').set(bearer(user)).expect(401);
    const login = await t
      .http()
      .post('/api/v1/auth/login')
      .send({ email: 'user@example.com', password: PASSWORD })
      .expect(401);
    expect(login.body.errorCode).toBe('ACCOUNT_DISABLED');
  });

  it('renames an organization', async () => {
    const admin = await superAdmin();
    const org = await setupOrg(t, 'a@example.com', 'Alpha Co');

    const res = await t
      .http()
      .patch(`/api/v1/admin/organizations/${org.orgId}`)
      .set(bearer(admin))
      .send({ name: 'Alpha Traders' })
      .expect(200);

    expect(res.body.data).toMatchObject({ name: 'Alpha Traders', isSuspended: false });
  });

  it('deletes an organization: members lose access and it leaves every list', async () => {
    const admin = await superAdmin();
    const org = await setupOrg(t, 'a@example.com', 'Alpha Co');

    await t
      .http()
      .delete(`/api/v1/admin/organizations/${org.orgId}`)
      .set(bearer(admin))
      .expect(200);

    await t.http().get('/api/v1/customers').set(org.headers).expect(404);
    const mine = await t.http().get('/api/v1/organizations').set(bearer(org.owner)).expect(200);
    const all = await t.http().get('/api/v1/admin/organizations').set(bearer(admin)).expect(200);
    expect(mine.body.data).toHaveLength(0);
    expect(all.body.data).toHaveLength(0);
  });

  it('edits a user and grants Super Admin, but not to remove your own', async () => {
    const admin = await superAdmin();
    const user = await registerUser(t, 'user@example.com', 'Old Name');

    const res = await t
      .http()
      .patch(`/api/v1/admin/users/${user.id}`)
      .set(bearer(admin))
      .send({ name: 'New Name', isSuperAdmin: true })
      .expect(200);
    const self = await t
      .http()
      .patch(`/api/v1/admin/users/${admin.id}`)
      .set(bearer(admin))
      .send({ isSuperAdmin: false })
      .expect(422);

    expect(res.body.data).toMatchObject({ name: 'New Name', isSuperAdmin: true });
    expect(self.body.errorCode).toBe('CANNOT_DEMOTE_SELF');
  });

  it('deletes a user with their solo organizations and frees the email', async () => {
    const admin = await superAdmin();
    const org = await setupOrg(t, 'solo@example.com', 'Solo Co');

    await t.http().delete(`/api/v1/admin/users/${org.owner.id}`).set(bearer(admin)).expect(200);

    await t.http().get('/api/v1/auth/me').set(bearer(org.owner)).expect(401);
    await t.http().get('/api/v1/customers').set(org.headers).expect(401);
    const users = await t.http().get('/api/v1/admin/users').set(bearer(admin)).expect(200);
    const orgs = await t.http().get('/api/v1/admin/organizations').set(bearer(admin)).expect(200);
    expect(users.body.data.map((u: { email: string }) => u.email)).toEqual(['root@ledgerloop.app']);
    expect(orgs.body.data).toHaveLength(0);
    await registerUser(t, 'solo@example.com');
  });

  it('will not delete yourself or the owner of a team', async () => {
    const admin = await superAdmin();
    const org = await setupOrg(t, 'owner@example.com', 'Team Co');
    await addMember(t, org, 'staff@example.com', 'STAFF');

    const self = await t
      .http()
      .delete(`/api/v1/admin/users/${admin.id}`)
      .set(bearer(admin))
      .expect(422);
    const owner = await t
      .http()
      .delete(`/api/v1/admin/users/${org.owner.id}`)
      .set(bearer(admin))
      .expect(422);

    expect(self.body.errorCode).toBe('CANNOT_DELETE_SELF');
    expect(owner.body.errorCode).toBe('USER_OWNS_TEAM');
  });
});
