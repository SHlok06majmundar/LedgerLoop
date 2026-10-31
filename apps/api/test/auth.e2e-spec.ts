import { PASSWORD, bearer, refreshCookieOf, registerUser, tokenFromMail } from './helpers';
import { createTestApp, type TestApp } from './test-app';

describe('Authentication', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
  });
  beforeEach(() => t.reset());
  afterAll(() => t.close());

  describe('registration', () => {
    it('creates an account, signs the user in and sends a verification email', async () => {
      const res = await t
        .http()
        .post('/api/v1/auth/register')
        .send({ name: 'Asha Rao', email: 'Asha@Example.com', password: PASSWORD })
        .expect(201);

      expect(res.body.data.user).toMatchObject({
        name: 'Asha Rao',
        email: 'asha@example.com',
        emailVerified: false,
      });
      expect(res.body.data.user.passwordHash).toBeUndefined();
      expect(res.body.data.accessToken).toEqual(expect.any(String));
      expect(refreshCookieOf(res)).toMatch(/^ll_refresh=/);
      expect(t.mailer.lastTo('asha@example.com')?.subject).toMatch(/verify/i);
    });

    it('rejects a second account with the same email', async () => {
      await registerUser(t, 'dup@example.com');

      const res = await t
        .http()
        .post('/api/v1/auth/register')
        .send({ name: 'Other', email: 'DUP@example.com', password: PASSWORD })
        .expect(409);

      expect(res.body.errorCode).toBe('EMAIL_TAKEN');
    });

    it('rejects a weak password with field details', async () => {
      const res = await t
        .http()
        .post('/api/v1/auth/register')
        .send({ name: 'Weak', email: 'weak@example.com', password: 'short' })
        .expect(400);

      expect(res.body.errorCode).toBe('VALIDATION_FAILED');
      expect(res.body.details[0].field).toBe('password');
    });
  });

  describe('login', () => {
    it('signs in with the right password', async () => {
      await registerUser(t, 'login@example.com');

      const res = await t
        .http()
        .post('/api/v1/auth/login')
        .send({ email: 'login@example.com', password: PASSWORD })
        .expect(200);

      expect(res.body.data.accessToken).toEqual(expect.any(String));
    });

    it('gives the same error for a wrong password and an unknown email', async () => {
      await registerUser(t, 'login@example.com');

      const wrong = await t
        .http()
        .post('/api/v1/auth/login')
        .send({ email: 'login@example.com', password: 'Wrong-pass-123' })
        .expect(401);
      const unknown = await t
        .http()
        .post('/api/v1/auth/login')
        .send({ email: 'nobody@example.com', password: PASSWORD })
        .expect(401);

      expect(wrong.body.errorCode).toBe('INVALID_CREDENTIALS');
      expect(unknown.body.errorCode).toBe('INVALID_CREDENTIALS');
    });
  });

  describe('session', () => {
    it('returns the current user for a valid access token', async () => {
      const user = await registerUser(t, 'me@example.com', 'Me Person');

      const res = await t.http().get('/api/v1/auth/me').set(bearer(user)).expect(200);

      expect(res.body.data).toMatchObject({ email: 'me@example.com', name: 'Me Person' });
    });

    it('rejects protected routes without a token', async () => {
      await t.http().get('/api/v1/auth/me').expect(401);
    });

    it('rotates the refresh token on refresh', async () => {
      const user = await registerUser(t, 'rotate@example.com');

      const res = await t
        .http()
        .post('/api/v1/auth/refresh')
        .set('Cookie', user.refreshCookie)
        .expect(200);

      expect(res.body.data.accessToken).toEqual(expect.any(String));
      expect(refreshCookieOf(res)).not.toBe(user.refreshCookie);
    });

    it('revokes the whole session family when a rotated refresh token is reused', async () => {
      const user = await registerUser(t, 'reuse@example.com');
      const rotated = await t
        .http()
        .post('/api/v1/auth/refresh')
        .set('Cookie', user.refreshCookie)
        .expect(200);
      const newCookie = refreshCookieOf(rotated);

      const reuse = await t
        .http()
        .post('/api/v1/auth/refresh')
        .set('Cookie', user.refreshCookie)
        .expect(401);
      expect(reuse.body.errorCode).toBe('REFRESH_TOKEN_REUSED');

      await t.http().post('/api/v1/auth/refresh').set('Cookie', newCookie).expect(401);
      await t
        .http()
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${rotated.body.data.accessToken}`)
        .expect(401);
    });

    it('logout ends only the current session', async () => {
      const first = await registerUser(t, 'logout@example.com');
      const second = await t
        .http()
        .post('/api/v1/auth/login')
        .send({ email: 'logout@example.com', password: PASSWORD })
        .expect(200);

      await t
        .http()
        .post('/api/v1/auth/logout')
        .set(bearer(first))
        .set('Cookie', first.refreshCookie)
        .expect(200);

      await t.http().get('/api/v1/auth/me').set(bearer(first)).expect(401);
      await t
        .http()
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${second.body.data.accessToken}`)
        .expect(200);
    });

    it('logout-all ends every session of the user', async () => {
      const first = await registerUser(t, 'all@example.com');
      const second = await t
        .http()
        .post('/api/v1/auth/login')
        .send({ email: 'all@example.com', password: PASSWORD })
        .expect(200);

      await t.http().post('/api/v1/auth/logout-all').set(bearer(first)).expect(200);

      await t
        .http()
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${second.body.data.accessToken}`)
        .expect(401);
    });
  });

  describe('email verification', () => {
    it('marks the email verified with the emailed token, once', async () => {
      const user = await registerUser(t, 'verify@example.com');
      const token = tokenFromMail(t, 'verify@example.com');

      await t.http().post('/api/v1/auth/verify-email').send({ token }).expect(200);
      const me = await t.http().get('/api/v1/auth/me').set(bearer(user)).expect(200);
      expect(me.body.data.emailVerified).toBe(true);

      const again = await t.http().post('/api/v1/auth/verify-email').send({ token }).expect(400);
      expect(again.body.errorCode).toBe('INVALID_TOKEN');
    });
  });

  describe('password reset', () => {
    it('does not reveal whether an email is registered', async () => {
      await t
        .http()
        .post('/api/v1/auth/forgot-password')
        .send({ email: 'ghost@example.com' })
        .expect(200);

      expect(t.mailer.outbox).toHaveLength(0);
    });

    it('sets a new password and signs out existing sessions', async () => {
      const user = await registerUser(t, 'reset@example.com');
      await t
        .http()
        .post('/api/v1/auth/forgot-password')
        .send({ email: 'reset@example.com' })
        .expect(200);
      const token = tokenFromMail(t, 'reset@example.com');

      await t
        .http()
        .post('/api/v1/auth/reset-password')
        .send({ token, password: 'Brand-new-pass-9' })
        .expect(200);

      await t.http().get('/api/v1/auth/me').set(bearer(user)).expect(401);
      await t
        .http()
        .post('/api/v1/auth/login')
        .send({ email: 'reset@example.com', password: 'Brand-new-pass-9' })
        .expect(200);
    });
  });

  describe('profile', () => {
    it('updates the display name', async () => {
      const user = await registerUser(t, 'profile@example.com', 'Old Name');

      const res = await t
        .http()
        .patch('/api/v1/auth/me')
        .set(bearer(user))
        .send({ name: 'New Name' })
        .expect(200);

      expect(res.body.data.name).toBe('New Name');
    });

    it('changes the password only with the current password', async () => {
      const user = await registerUser(t, 'change@example.com');

      await t
        .http()
        .post('/api/v1/auth/change-password')
        .set(bearer(user))
        .send({ currentPassword: 'Wrong-pass-123', newPassword: 'Another-pass-42' })
        .expect(401);
      await t
        .http()
        .post('/api/v1/auth/change-password')
        .set(bearer(user))
        .send({ currentPassword: PASSWORD, newPassword: 'Another-pass-42' })
        .expect(200);
      await t
        .http()
        .post('/api/v1/auth/login')
        .send({ email: 'change@example.com', password: 'Another-pass-42' })
        .expect(200);
    });
  });

  describe('mobile clients', () => {
    const mobile = { 'X-Client': 'mobile' };

    it('returns the refresh token in the body instead of a cookie', async () => {
      await registerUser(t, 'phone@example.com');

      const res = await t
        .http()
        .post('/api/v1/auth/login')
        .set(mobile)
        .send({ email: 'phone@example.com', password: PASSWORD })
        .expect(200);

      expect(res.body.data.refreshToken).toEqual(expect.any(String));
      expect(res.headers['set-cookie']).toBeUndefined();
    });

    it('rotates a refresh token sent in the body', async () => {
      await registerUser(t, 'phone@example.com');
      const login = await t
        .http()
        .post('/api/v1/auth/login')
        .set(mobile)
        .send({ email: 'phone@example.com', password: PASSWORD })
        .expect(200);

      const refreshed = await t
        .http()
        .post('/api/v1/auth/refresh')
        .set(mobile)
        .send({ refreshToken: login.body.data.refreshToken })
        .expect(200);
      const reused = await t
        .http()
        .post('/api/v1/auth/refresh')
        .set(mobile)
        .send({ refreshToken: login.body.data.refreshToken })
        .expect(401);

      expect(refreshed.body.data.refreshToken).not.toBe(login.body.data.refreshToken);
      expect(reused.body.errorCode).toBe('REFRESH_TOKEN_REUSED');
    });

    it('ignores body refresh tokens from browsers', async () => {
      await registerUser(t, 'phone@example.com');
      const login = await t
        .http()
        .post('/api/v1/auth/login')
        .set(mobile)
        .send({ email: 'phone@example.com', password: PASSWORD })
        .expect(200);

      await t
        .http()
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: login.body.data.refreshToken })
        .expect(401);
    });
  });
});
