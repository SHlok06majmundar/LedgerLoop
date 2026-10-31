# Allocations are the source of truth for invoice balances

An Invoice's Outstanding amount is its total minus active Allocations. `invoices.allocated_amount` and `payments.allocated_amount` are caches updated in the same transaction as the Allocation or Reversal that changes them, under a row lock, and a verification query can recompute them. Corrections never update or delete an Allocation; they add a Reversal.
