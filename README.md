# LedgerLoop

Multi-tenant accounts-receivable platform for invoices, incoming payments, bank reconciliation and automated collections, built for Indian B2B businesses.

LedgerLoop sits between invoice creation and cash in the bank. It answers five questions every day:

1. How much money is outstanding right now?
2. Which customers have not paid?
3. Which bank transactions correspond to which invoices?
4. Which payments have discrepancies that need review?
5. Which customers should receive a payment reminder?

It is not an accounting or ERP system; it is the operational layer around receivables.

## What is in the repository

| Path | What it is |
|---|---|
| `apps/api` | NestJS REST API, background worker and scheduler (MongoDB, Mongoose) |
| `apps/web` | Next.js app: public website, business dashboard and Super Admin panel |
| `apps/mobile` | Expo / React Native companion app for Android and iOS |
| `packages/shared-types` | Enums, money arithmetic, role permissions shared by every app |
| `packages/validation` | Zod schemas shared by API validation and client forms |
| `docs/` | Product, architecture, database, API, security and deployment notes |
| `docs/adr/` | Architecture decision records |
| `CONTEXT.md` | Domain glossary: the words this codebase uses and what they mean |

## Features

- **Organizations and roles**: owner, admin, accountant, manager, staff and viewer; invitations; every record is isolated per organization and checked on the server.
- **Customers**: GSTIN, addresses, payment terms, credit limits, reminder preferences, account summary.
- **Invoices**: GST line items computed exactly in paise, sequential numbering, draft → issued → paid / overdue / void, PDF download and email delivery.
- **Payments**: UPI, NEFT, RTGS, IMPS, cheque and cash; allocation across invoices with race-safe over-allocation guards; idempotent writes; reversals instead of deletion.
- **Bank imports**: CSV statements from any Indian bank, header and column detection, duplicate skipping, failed-row report, background processing.
- **Reconciliation**: explainable scoring against payments, invoices and combined invoice groups; automatic matches only when strict rules pass; suggestions, discrepancies and an exception queue with assignment and comments.
- **Collections**: configurable reminder schedule, manual reminders, retries and full communication history.
- **Analytics**: outstanding, overdue, aging buckets, collection rate, top debtors and reconciliation metrics.
- **Audit log**: append-only history of every financial and access change.
- **Super Admin panel**: platform stats, organization suspension, user deactivation.
- **Mobile app**: dashboard, invoices, customers, record payments, approve matches.

## Running locally

Requirements: Node.js 22+, pnpm 10, a MongoDB Atlas cluster (replica set, for transactions) and an SMTP account (Gmail app password works).

```bash
pnpm install
pnpm --filter "./packages/*" build

# API
cp apps/api/.env.example apps/api/.env      # fill in MongoDB, SMTP and JWT secret
pnpm --filter @ledgerloop/api dev            # http://localhost:4000, docs at /api/docs

# Web
cp apps/web/.env.example apps/web/.env.local
pnpm --filter @ledgerloop/web dev            # http://localhost:3000

# Mobile (Expo Go or an emulator)
cp apps/mobile/.env.example apps/mobile/.env
pnpm --filter @ledgerloop/mobile dev
```

With `RUN_WORKER=true` and `RUN_SCHEDULER=true` in `apps/api/.env`, a single API process also runs background jobs and scheduled reminders. Uploaded statements and generated PDFs are stored under `apps/api/uploads`.

To open the Super Admin panel, register on the web app, then:

```bash
pnpm --filter @ledgerloop/api build
pnpm --filter @ledgerloop/api admin:promote you@example.com
```

## Tests

```bash
pnpm --filter @ledgerloop/shared-types test   # money and permission rules
pnpm --filter @ledgerloop/api test            # domain unit tests
pnpm --filter @ledgerloop/api test:e2e        # HTTP tests against MONGODB_TEST_DB
```

End-to-end tests wipe the test database (`MONGODB_TEST_DB`, default `ledgerloop_test`) before each test. Never point it at real data.

## Deployment

The web app deploys to Vercel and the API to Render; see [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).
