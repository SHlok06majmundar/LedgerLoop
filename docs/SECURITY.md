# Security

## Authentication

- Passwords hashed with Argon2id; unknown emails cost the same as wrong passwords, and both return `INVALID_CREDENTIALS`.
- Short-lived JWT access tokens (15 minutes) carry the session id; every request checks the session is still active and the user enabled, so sign-out and deactivation take effect immediately.
- Refresh tokens are random 48-byte values stored only as SHA-256 hashes. Each refresh rotates the token; presenting an already-rotated token revokes the whole session family.
- Browsers receive the refresh token in an httpOnly cookie scoped to `/api/v1/auth` (`Secure` and `SameSite=None` in production). Native apps opt in with `X-Client: mobile` and store it in the device keychain/keystore.
- Email verification, password reset and invitation tokens are single-use, hashed and expiring. Password reset signs out every session.

## Authorization

- Every tenant record has an `organizationId`; repositories always filter by it. Records from another organization return `404`, never `403`, so ids reveal nothing.
- Role permissions (`packages/shared-types/src/permissions.ts`) are enforced by the organization guard on the server; the clients only use them to hide actions.
- Super Admin access is a separate flag checked on every admin request.

## Data integrity

- Money is integer minor units; no floating-point arithmetic touches amounts.
- Financial writes require idempotency keys, run in transactions, and are recorded in an append-only audit log with request ids.
- Posted payments are reversed, never deleted.

## Transport and input

- Helmet security headers, CORS limited to `WEB_ORIGINS`, global rate limits with stricter auth limits.
- All input validated with zod schemas; uploads limited by size and type, stored under organization-scoped keys with path traversal checks, and served only through authorized routes.
- Logs redact authorization headers and cookies.

## Operations

- Secrets live in environment variables (`apps/api/.env` locally, the hosting dashboard in production) and are never committed.
- Rotate `JWT_ACCESS_SECRET`, database and SMTP credentials if they are ever exposed.
- End-to-end tests refuse to run against a database whose name does not end in `_test`.
