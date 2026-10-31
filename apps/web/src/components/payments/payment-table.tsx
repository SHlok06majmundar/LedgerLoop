'use client';

import { Link2 } from 'lucide-react';
import Link from 'next/link';
import { StatusBadge } from '@/components/ui/badge';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { date, humanize, money } from '@/lib/format';
import { refName, type Payment } from '@/lib/types';

export function PaymentTable({ payments, showCustomer = true }: { payments: Payment[]; showCustomer?: boolean }) {
  return (
    <Table>
      <THead>
        <TR>
          <TH>Payment</TH>
          {showCustomer && <TH>Customer</TH>}
          <TH>Date</TH>
          <TH>Method</TH>
          <TH>Reference</TH>
          <TH>Status</TH>
          <TH className="text-right">Amount</TH>
          <TH className="text-right">Unallocated</TH>
        </TR>
      </THead>
      <TBody>
        {payments.map((p) => (
          <TR key={p.id}>
            <TD>
              <Link href={`/payments/${p.id}`} className="font-medium text-primary hover:underline">
                {p.paymentNumber}
              </Link>
              {p.bankTransactionId && (
                <Link2 className="ml-1.5 inline size-3.5 text-success" aria-label="Reconciled with bank" />
              )}
            </TD>
            {showCustomer && <TD className="max-w-48 truncate">{refName(p.customerId)}</TD>}
            <TD className="whitespace-nowrap text-muted-foreground">{date(p.paymentDate)}</TD>
            <TD>{humanize(p.method)}</TD>
            <TD className="font-mono text-xs">{p.reference ?? '—'}</TD>
            <TD>
              <StatusBadge status={p.status} />
            </TD>
            <TD className="text-right tabular">{money(p.amountMinor)}</TD>
            <TD className="text-right tabular text-muted-foreground">
              {p.unallocatedMinor ? money(p.unallocatedMinor) : '—'}
            </TD>
          </TR>
        ))}
      </TBody>
    </Table>
  );
}
