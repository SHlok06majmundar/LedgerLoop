# LedgerLoop: product requirements

LedgerLoop is a multi-tenant B2B platform that helps businesses manage invoices, track incoming payments, reconcile bank transactions and automate customer payment follow-ups.

**Target customers**: wholesale distributors, small and medium manufacturers, retail suppliers, service businesses and agencies with recurring invoices.

**Positioning**: not an accounting or ERP replacement; the operational layer between invoice creation, incoming payments, reconciliation and collections.

## Objectives

- Reduce manual payment reconciliation.
- Improve visibility into outstanding invoices.
- Detect partial payments and discrepancies.
- Prevent duplicate transaction processing.
- Keep an auditable history of financial changes.
- Automate repetitive collection work.

## Roles

| Role | Can |
|---|---|
| Super Admin | Administer the platform |
| Owner | Everything in the organization, including settings |
| Admin | Manage members, customers, invoices and payments |
| Accountant | Invoices, payments and reconciliation |
| Manager | View analytics, approve matches and exceptions |
| Staff | Customers and draft invoices |
| Viewer | Read-only |

## Modules and acceptance

1. **Authentication and organizations**: registration, verification, password reset, rotating refresh tokens, sign-out of one or all sessions, organizations, expiring invitations, roles, member deactivation. A user never sees another organization's records.
2. **Customers**: contact details, GSTIN, billing and shipping addresses, credit limit, payment terms, notes, archiving; detail page with overview, invoices, payments, reconciliation and activity.
3. **Invoices**: unique numbers, multiple line items, tax and discounts, due dates, PDF, email, statuses draft, issued, partially paid, paid, overdue and void. Invoices with allocated payments cannot be voided without an auditable reversal.
4. **Payments**: full and partial payments, allocation across invoices, references, methods UPI, NEFT, RTGS, IMPS, bank transfer, cash and cheque; never over-allocated; one transaction; reversal instead of deletion; duplicate reference detection.
5. **Bank imports**: CSV upload, column mapping, validation, duplicate detection, failed-row report, import history; processed in the background with progress.
6. **Reconciliation**: normalize, identify customers, find candidates, score, rank; auto-match only when strict rules pass; suggestions and discrepancies go to review; every decision explained. Statuses: unmatched, suggested, matched, partially matched, discrepancy, rejected, ignored.
7. **Exceptions**: review unmatched credits, approve or reject suggestions, match manually, resolve discrepancies, comment, assign, track resolution time.
8. **Collections**: reminders before, on and after the due date, escalations, configurable schedules, communication history, retries, pause and resume, manual reminders.
9. **Dashboard and analytics**: invoiced, received, outstanding, overdue, partially paid, unmatched, collection rate; monthly trends, aging, top customers, reconciliation rate.
10. **Audit logs**: who created, changed, allocated, approved or reversed what, when, with before and after values and the request id; append-only.

## Non-functional targets

Exact money arithmetic, idempotent processing, organization-level authorization, HTTPS, rate limiting, backups with tested restores, structured logs with correlation ids, horizontally scalable workers. P95 under 500 ms for ordinary reads is a target to validate under load, not a measured claim.
