# Money is stored as integer minor units

Every amount is a whole number of minor units (paise for INR), stored and transported as a safe-integer `number`. MongoDB stores these as doubles, which represent every integer up to 2^53 exactly. Quantities are stored in thousandths and tax rates in basis points, so line totals are computed with `bigint` and rounded half-up once. We rejected decimal strings because they force a decimal library on every client, and fractional floats because they cannot represent money exactly.

## Consequences

- Schemas validate amounts with `Number.isSafeInteger`; nothing writes a fractional amount.
- Formatting to rupees happens only at the display edge.
