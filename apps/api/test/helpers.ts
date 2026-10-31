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

export async function registerUser(t: TestApp, email: string, name = 'Test User'): Promise<AuthedUser> {
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
