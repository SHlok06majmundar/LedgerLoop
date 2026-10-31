# Allocations are the source of truth for invoice balances

An Invoice's Outstanding amount is its total minus active Allocations. `invoice.allocatedMinor` and `payment.allocatedMinor` are caches changed only inside the same MongoDB transaction as the Allocation or Reversal that moves them. Each cache update is a conditional `$inc` whose filter requires the new value to stay within the total, so two concurrent allocations cannot both succeed past the limit. Corrections never update or delete an Allocation; they add a Reversal.
