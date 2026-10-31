import type { Response } from 'supertest';
import type { TestApp } from './test-app';

export const PASSWORD = 'Sup3rSecret!pass';

export interface AuthedUser {
  id: string;
  email: string;
  accessToken: string;
  refreshCookie: string;
}

export function refreshCookieOf(res: Response): string {
  const cookies = ([] as string[]).concat(res.headers['set-cookie'] ?? []);
  const cookie = cookies.find((c) => c.startsWith('ll_refresh='));
  if (!cookie) throw new Error('No refresh cookie set');
  return cookie.split(';')[0]!;
}

/** Extracts the token query parameter from the last link in an email. */
export function tokenFromMail(t: TestApp, email: string): string {
  const mail = t.mailer.lastTo(email);
  if (!mail) throw new Error(`No mail sent to ${email}`);
  const match = mail.text.match(/token=([\w-]+)/);
  if (!match) throw new Error('No token link in mail');
  return match[1]!;
}

export async function registerUser(
  t: TestApp,
  email: string,
  name = 'Test User',
): Promise<AuthedUser> {
  const res = await t
    .http()
    .post('/api/v1/auth/register')
    .send({ name, email, password: PASSWORD })
    .expect(201);
  return {
    id: res.body.data.user.id,
    email,
    accessToken: res.body.data.accessToken,
    refreshCookie: refreshCookieOf(res),
  };
}

export const bearer = (user: AuthedUser) => ({ Authorization: `Bearer ${user.accessToken}` });

export interface OrgContext {
  owner: AuthedUser;
  orgId: string;
  /** Bearer + X-Organization-Id headers for header-scoped routes. */
  headers: Record<string, string>;
}

export async function setupOrg(
  t: TestApp,
  email = 'owner@example.com',
  name = 'ABC Traders',
): Promise<OrgContext> {
  const owner = await registerUser(t, email);
  const res = await t
    .http()
    .post('/api/v1/organizations')
    .set(bearer(owner))
    .send({ name })
    .expect(201);
  const orgId = res.body.data.id as string;
  return { owner, orgId, headers: { ...bearer(owner), 'X-Organization-Id': orgId } };
}

/** Invites a new user with the given role and returns headers acting as them. */
export async function addMember(t: TestApp, ctx: OrgContext, email: string, role: string) {
  const user = await registerUser(t, email);
  await t
    .http()
    .post(`/api/v1/organizations/${ctx.orgId}/invitations`)
    .set(bearer(ctx.owner))
    .send({ email, role })
    .expect(201);
  const token = tokenFromMail(t, email);
  await t.http().post('/api/v1/invitations/accept').set(bearer(user)).send({ token }).expect(200);
  return { ...bearer(user), 'X-Organization-Id': ctx.orgId };
}
