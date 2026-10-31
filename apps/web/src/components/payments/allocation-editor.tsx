'use client';

import { useQuery } from '@tanstack/react-query';
import { Wand2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EmptyState, Skeleton } from '@/components/ui/feedback';
import { Input } from '@/components/ui/input';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { apiPage } from '@/lib/api';
import { date, minorToInput, money, parseMoneyInput } from '@/lib/format';
import { useOrgQueryKey } from '@/lib/hooks';
import type { Invoice } from '@/lib/types';

export type AllocationDraft = Record<string, string>;

/** Totals the drafted allocation inputs; null when any input is not a valid amount. */
export function allocationLines(draft: AllocationDraft) {
  const lines: { invoiceId: string; amountMinor: number }[] = [];
  for (const [invoiceId, text] of Object.entries(draft)) {
    if (!text.trim()) continue;
    const amountMinor = parseMoneyInput(text);
    if (amountMinor === null) return null;
    if (amountMinor > 0) lines.push({ invoiceId, amountMinor });
  }
  return lines;
}

/** Lists a customer's open invoices with an amount box for each. */
export function AllocationEditor({
  customerId,
  availableMinor,
  draft,
  onChange,
}: {
  customerId: string;
  availableMinor: number;
  draft: AllocationDraft;
  onChange: (draft: AllocationDraft) => void;
}) {
  const invoices = useQuery({
    queryKey: useOrgQueryKey('customers', customerId, 'invoices', 'open'),
    queryFn: () =>
      apiPage<Invoice>(`/customers/${customerId}/invoices`, {
        query: { status: 'OPEN', limit: 100, sort: 'dueDate', order: 'asc' },
      }),
    enabled: Boolean(customerId),
  });
  const lines = allocationLines(draft);
  const allocated = lines?.reduce((s, l) => s + l.amountMinor, 0) ?? 0;
  const remaining = availableMinor - allocated;

  const autoAllocate = () => {
    let left = availableMinor;
    const next: AllocationDraft = {};
    for (const inv of invoices.data?.items ?? []) {
      if (left <= 0) break;
      const amount = Math.min(left, inv.outstandingMinor);
      next[inv.id] = minorToInput(amount);
      left -= amount;
    }
    onChange(next);
  };

  if (!customerId) return <p className="text-sm text-muted-foreground">Choose a customer to see their open invoices.</p>;
  if (invoices.isPending) return <Skeleton className="h-32" />;
  if (!invoices.data?.items.length) {
    return <EmptyState title="No open invoices" description="The payment will be kept as unallocated credit." />;
  }

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm">
          Allocated <span className="font-medium tabular">{money(allocated)}</span> · Remaining{' '}
          <span className={`font-medium tabular ${remaining < 0 ? 'text-danger' : ''}`}>{money(remaining)}</span>
        </p>
        <Button type="button" size="sm" variant="outline" onClick={autoAllocate} disabled={availableMinor <= 0}>
          <Wand2 /> Oldest first
        </Button>
      </div>
      <div className="overflow-hidden rounded-lg border">
        <Table>
          <THead>
            <TR>
              <TH>Invoice</TH>
              <TH>Due</TH>
              <TH className="text-right">Outstanding</TH>
              <TH className="w-36 text-right">Apply (₹)</TH>
            </TR>
          </THead>
          <TBody>
            {invoices.data.items.map((inv) => {
              const value = draft[inv.id] ?? '';
              const parsed = value ? parseMoneyInput(value) : 0;
              const invalid = parsed === null || (parsed ?? 0) > inv.outstandingMinor;
              return (
                <TR key={inv.id}>
                  <TD className="font-medium">{inv.invoiceNumber}</TD>
                  <TD className="text-muted-foreground">{date(inv.dueDate)}</TD>
                  <TD className="text-right tabular">{money(inv.outstandingMinor)}</TD>
                  <TD>
                    <Input
                      inputMode="decimal"
                      className="text-right"
                      aria-label={`Amount for ${inv.invoiceNumber}`}
                      aria-invalid={invalid}
                      value={value}
                      placeholder="0.00"
                      onChange={(e) => onChange({ ...draft, [inv.id]: e.target.value })}
                    />
                  </TD>
                </TR>
              );
            })}
          </TBody>
        </Table>
      </div>
      {remaining < 0 && <p className="text-xs text-danger">Allocations exceed the payment amount.</p>}
    </div>
  );
}
