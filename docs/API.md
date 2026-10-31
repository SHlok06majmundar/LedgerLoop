# API

Base path `/api/v1`. Interactive OpenAPI documentation is served at `/api/docs` by every running API.

## Conventions

- **Authentication**: `Authorization: Bearer <accessToken>`. Access tokens last 15 minutes; refresh with `POST /auth/refresh` (cookie for browsers, body `refreshToken` with `X-Client: mobile` for apps).
- **Organization scope**: send `X-Organization-Id` on organization-scoped routes. Records from other organizations return `404`.
- **Idempotency**: `POST /payments`, `POST /payments/:id/allocations` and `POST /payments/:id/reversals` require an `Idempotency-Key` header. Repeating a request with the same key and body replays the first result; a different body returns `422 IDEMPOTENCY_KEY_REUSED`.
- **Lists**: `page`, `limit` (max 100), `search`, `sort`, `order`; responses include `meta: { page, limit, total, totalPages }`.
- **Money**: integers in minor units (`amountMinor: 2500050` is ₹25,000.50). Quantities are thousandths, tax rates basis points.
- **Dates**: calendar dates as `YYYY-MM-DD`.

```json
{ "success": true, "message": "Invoice created successfully", "data": { "id": "…" }, "meta": null }
{ "success": false, "message": "Invoice not found", "errorCode": "INVOICE_NOT_FOUND", "details": null }
```

## Endpoints

| Area | Endpoints |
|---|---|
| Auth | `POST /auth/register` `login` `refresh` `logout` `logout-all` `forgot-password` `reset-password` `verify-email` `resend-verification` `change-password`; `GET /auth/me`, `PATCH /auth/me` |
| Organizations | `POST/GET /organizations`; `GET/PATCH /organizations/:id`; `POST/GET /organizations/:id/logo`; `GET /organizations/:id/members`; `PATCH/DELETE /organizations/:id/members/:memberId`; `POST/GET /organizations/:id/invitations`; `DELETE /organizations/:id/invitations/:invitationId` |
| Invitations | `GET /invitations/preview?token=`; `POST /invitations/accept` |
| Customers | `POST/GET /customers`; `GET/PATCH/DELETE /customers/:id`; `POST /customers/:id/restore`; `GET /customers/:id/summary` `invoices` `payments` |
| Invoices | `POST/GET /invoices`; `GET/PATCH /invoices/:id`; `POST /invoices/:id/issue` `void` `send`; `GET /invoices/:id/pdf` `payments` |
| Payments | `POST/GET /payments`; `GET /payments/:id`; `POST/GET /payments/:id/allocations`; `POST /payments/:id/reversals`; `GET /payments/:id/history` |
| Bank imports | `POST/GET /bank-imports`; `GET /bank-imports/:id`; `POST /bank-imports/:id/confirm`; `GET /bank-imports/:id/progress` `errors` (`?format=csv`); `GET /bank-transactions`, `/bank-transactions/:id` |
| Reconciliation | `POST/GET /reconciliation/runs`; `GET /reconciliation/runs/:id`; `GET /reconciliation/matches`, `/matches/:id`; `POST /reconciliation/matches/:id/approve` `reject` `manual-match`; `POST /reconciliation/transactions/:id/manual-match`; `GET /reconciliation/exceptions`; `PATCH /reconciliation/exceptions/:id`; `POST /reconciliation/exceptions/:id/ignore` |
| Collections | `GET/PUT /collections/settings`; `POST /collections/run`; `POST/GET /collections/reminders`; `POST /collections/reminders/:id/send`; `PATCH /collections/reminders/:id`; `POST /collections/invoices/:id/pause` `resume` |
| Communications | `GET /communications`; `POST /communications/:id/retry` `cancel` |
| Notifications | `GET /notifications`; `PATCH /notifications/:id/read`; `POST /notifications/read-all` |
| Analytics | `GET /analytics/dashboard` `collections` `aging` `customers` `reconciliation` |
| Audit | `GET /audit-logs` |
| Admin (Super Admin) | `GET /admin/stats`; `GET/PATCH /admin/organizations[/:id]`; `GET/PATCH /admin/users[/:id]` |
| Health | `GET /health` |
