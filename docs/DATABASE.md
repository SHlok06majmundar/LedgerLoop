# Database

MongoDB Atlas with Mongoose (ADR 0005). Every tenant collection carries `organizationId` as a required field and as the leading key of its indexes. All money is an integer number of minor units (ADR 0002).

## Collections

| Collection | Key fields | Important indexes |
|---|---|---|
| `users` | name, email, passwordHash (hidden), isActive, isSuperAdmin, emailVerifiedAt | unique email |
| `sessions` | userId, familyId, tokenHash, expiresAt, revokedAt, replacedBy | unique tokenHash; TTL after expiry |
| `action_tokens` | userId, type, tokenHash, expiresAt, usedAt | unique tokenHash; TTL |
| `organizations` | name, slug, currency, timezone, billing details, logoKey, isSuspended | unique slug |
| `memberships` | organizationId, userId, role, status | unique (organizationId, userId) |
| `invitations` | organizationId, email, role, tokenHash, expiresAt, acceptedAt, revokedAt | unique tokenHash |
| `customers` | organizationId, name, email, gstin, addresses, creditLimitMinor, paymentTermsDays, remindersEnabled, archivedAt | (organizationId, archivedAt, name) |
| `invoices` | organizationId, customerId, invoiceNumber, status, issueDate, dueDate, items[], totals, allocatedMinor, customerSnapshot | unique (organizationId, invoiceNumber); (organizationId, status, dueDate) |
| `payments` | organizationId, customerId, paymentNumber, amountMinor, allocatedMinor, method, reference, paymentDate, status, bankTransactionId | unique (organizationId, paymentNumber); unique (organizationId, reference) among posted payments |
| `payment_allocations` | organizationId, paymentId, invoiceId, amountMinor, status, reversalId | (organizationId, paymentId), (organizationId, invoiceId) |
| `reversals` | organizationId, kind, paymentId, allocationIds, amountMinor, reason | (organizationId, paymentId) |
| `import_jobs` | organizationId, fileKey, status, mapping, row counters, rowErrors | (organizationId, createdAt) |
| `bank_transactions` | organizationId, importJobId, transactionDate, description, reference, amountMinor, direction, fingerprint, status, paymentId, rejectedKeys | unique (organizationId, fingerprint) |
| `reconciliation_runs` | organizationId, status, trigger, stats | (organizationId, createdAt) |
| `reconciliation_matches` | organizationId, bankTransactionId, kind, candidateKey, score, signals, blocks, status, decision | (organizationId, status, createdAt) |
| `reconciliation_exceptions` | organizationId, bankTransactionId, status, reason, assigneeId, comments, openedAt, resolvedAt | unique (organizationId, bankTransactionId) |
| `communications` | organizationId, customerId, invoiceIds, kind, to, status, scheduledAt, sentAt, reminderKey | unique (organizationId, reminderKey) |
| `collection_settings` | organizationId, enabled, sendHour, rules | unique organizationId |
| `notifications` | userId, organizationId, type, title, link, readAt | (userId, readAt, createdAt); TTL 90 days |
| `audit_logs` | organizationId, userId, action, entityType, entityId, before, after, requestId | (organizationId, createdAt); append-only hooks |
| `jobs` | name, payload, status, runAt, attempts, lockedUntil, dedupeKey | (status, runAt); unique dedupeKey while pending |
| `idempotency_keys` | hashed key, requestHash, state, stored response | TTL 24 hours |
| `counters` | `_id` = sequence key, seq | — |

## Integrity rules

- Payments and their allocations commit in one multi-document transaction.
- `invoice.allocatedMinor` and `payment.allocatedMinor` are caches changed only by conditional `$inc` updates that refuse to exceed the total (ADR 0004). Concurrent allocations cannot over-allocate; this is covered by a race test.
- Posted payments are never deleted; corrections create `reversals`.
- Invoices with active allocations cannot be voided.
- Bank lines are identified by a fingerprint of date, direction, amount, reference, narration and occurrence, so re-importing a statement adds nothing.
