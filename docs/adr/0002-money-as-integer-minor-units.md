# Money is stored as integer minor units

Every amount is a whole number of minor units (paise for INR): `BIGINT` in Postgres and a safe-integer `number` in TypeScript and JSON. Quantities are stored in thousandths and tax rates in basis points, so line totals are computed with `bigint` and rounded half-up once. We rejected decimal strings because they force a decimal library on every client, and floats because they cannot represent money exactly.

## Consequences

- Repositories convert Prisma `bigint` values to `number` and refuse values outside `Number.MAX_SAFE_INTEGER`.
- Formatting to rupees happens only at the display edge.
