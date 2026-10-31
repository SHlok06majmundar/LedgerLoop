# Architecture

LedgerLoop is a modular monolith (ADR 0001): one NestJS codebase, split into feature modules, deployed as an HTTP API, a job worker and a single scheduler. Clients are a Next.js web app and an Expo mobile app.

```
 Next.js web ─┐                      ┌─ MongoDB Atlas (replica set)
              ├─ HTTPS /api/v1 ─ API ┤
 Expo mobile ─┘     Socket.io        ├─ uploads/ (statements, PDFs)
                                     └─ SMTP (invoices, reminders)
          worker ── jobs collection ── scheduler (cron → jobs)
```

## Request path

1. `requestContextMiddleware` assigns a correlation id (`X-Request-Id`) stored in AsyncLocalStorage.
2. `ThrottlerGuard` rate-limits; auth endpoints have stricter limits.
3. `AccessTokenGuard` verifies the JWT and that its session is still active and the user enabled.
4. `OrganizationGuard` resolves `X-Organization-Id` (or the route's organization id) to an active membership and checks the route's permission. Non-members get 404 (ADR 0003).
5. `ZodValidationPipe` validates input with the shared schemas from `@ledgerloop/validation`.
6. `ResponseEnvelopeInterceptor` wraps results as `{ success, message, data, meta }`; `AllExceptionsFilter` maps every error to `{ success: false, errorCode, message, details }`.

## Modules

| Module | Responsibility |
|---|---|
| auth, users | Registration, login, rotating refresh tokens, email verification, password reset |
| organizations | Organizations, memberships, invitations, logo |
| customers | Customer records, archiving |
| invoices | Drafts, numbering, issuing, voiding, status derivation, PDF rendering |
| payments | Payments, allocations, reversals, customer account summary (`LedgerService` holds the money rules) |
| bank-imports | CSV upload, column mapping, background parsing, duplicate detection |
| reconciliation | Candidate pool, scoring engine (`domain/matching.ts`), runs, match decisions, exceptions |
| communications | Customer emails as records delivered by jobs, with retry |
| collections | Reminder schedule, automated runs, manual reminders |
| analytics | Read-only reporting aggregations |
| notifications | In-app notifications and the realtime gateway |
| audit-logs | Append-only change history |
| admin | Super Admin platform endpoints |

Pure domain logic lives in `domain/` folders (money, invoice status, statement parsing, matching, reminder steps) and is unit-tested without a database. Everything else is tested end to end over HTTP.

## Background work

Jobs are documents in the `jobs` collection (ADR 0006). The worker claims a job with an atomic update, retries failures with exponential backoff and recovers jobs whose lock expired. The scheduler only enqueues: hourly overdue refresh and reminder runs, deduplicated so a slow run never piles up.

## Realtime

The Socket.io gateway (`/realtime` namespace) authenticates with the access token and watches MongoDB change streams on `notifications` and `import_jobs`, so updates written by the worker reach browsers connected to any API instance without a broker.

## Clients

- **Web** keeps the access token in memory and the refresh token in an httpOnly cookie scoped to `/api/v1/auth`.
- **Mobile** sends `X-Client: mobile`, receives the refresh token in the response body and stores it with `expo-secure-store`.
