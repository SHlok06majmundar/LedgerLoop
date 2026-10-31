'use client';

import Link from 'next/link';
import { StatusBadge } from '@/components/ui/badge';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { date, money } from '@/lib/format';
import { refName, type Invoice } from '@/lib/types';

export function InvoiceTable({ invoices, showCustomer = true }: { invoices: Invoice[]; showCustomer?: boolean }) {
  return (
    <Table>
      <THead>
        <TR>
          <TH>Invoice</TH>
          {showCustomer && <TH>Customer</TH>}
          <TH>Issued</TH>
          <TH>Due</TH>
          <TH>Status</TH>
          <TH className="text-right">Total</TH>
          <TH className="text-right">Outstanding</TH>
        </TR>
      </THead>
      <TBody>
        {invoices.map((inv) => (
          <TR key={inv.id}>
            <TD>
              <Link href={`/invoices/${inv.id}`} className="font-medium text-primary hover:underline">
                {inv.invoiceNumber}
              </Link>
            </TD>
            {showCustomer && <TD className="max-w-48 truncate">{refName(inv.customerId)}</TD>}
            <TD className="whitespace-nowrap text-muted-foreground">{date(inv.issueDate)}</TD>
            <TD className="whitespace-nowrap text-muted-foreground">{date(inv.dueDate)}</TD>
            <TD>
              <StatusBadge status={inv.status} />
            </TD>
            <TD className="text-right tabular">{money(inv.totalMinor, inv.currency)}</TD>
            <TD className="text-right font-medium tabular">{money(inv.outstandingMinor, inv.currency)}</TD>
          </TR>
        ))}
      </TBody>
    </Table>
  );
}
