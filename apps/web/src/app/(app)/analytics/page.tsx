'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useState } from 'react';
import { MoneyBarChart, monthLabel } from '@/components/charts';
import { FilterTabs } from '@/components/app/list';
import { PageHeader } from '@/components/app/page-header';
import { StatTile } from '@/components/app/stat-tile';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/feedback';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { api } from '@/lib/api';
import { humanize, money, percentFromBps } from '@/lib/format';
import { useOrgQueryKey } from '@/lib/hooks';

type Monthly = {
  month: string;
  invoicedMinor: number;
  receivedMinor: number;
  outstandingMinor: number;
};
interface Recon {
  creditTransactions: number;
  matchedTransactions: number;
  matchRateBps: number;
  decisions: Record<string, number>;
  openExceptions: number;
  averageResolutionMinutes: number | null;
}
interface TopCustomer {
  customerId: string;
  name: string;
  outstandingMinor: number;
  overdueMinor: number;
  invoicedMinor: number;
  openInvoices: number;
}

export default function AnalyticsPage() {
  const [months, setMonths] = useState('12');
  const monthly = useQuery({
    queryKey: useOrgQueryKey('analytics', 'collections', months),
    queryFn: () => api<Monthly[]>('/analytics/collections', { query: { months } }),
  });
  const recon = useQuery({
    queryKey: useOrgQueryKey('analytics', 'reconciliation'),
    queryFn: () => api<Recon>('/analytics/reconciliation'),
  });
  const aging = useQuery({
    queryKey: useOrgQueryKey('analytics', 'aging'),
    queryFn: () => api<{ asOf: string; buckets: { bucket: string; amountMinor: number; invoices: number }[] }>('/analytics/aging'),
  });
  const top = useQuery({
    queryKey: useOrgQueryKey('analytics', 'customers', 10),
    queryFn: () => api<TopCustomer[]>('/analytics/customers', { query: { limit: 10 } }),
  });
  const r = recon.data;
  const totalAging = aging.data?.buckets.reduce((s, b) => s + b.amountMinor, 0) ?? 0;

  return (
    <>
      <PageHeader title="Analytics" description="How fast money comes in, and where it is stuck." />

      <Card>
        <CardHeader className="flex-row flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle>Invoiced, received and still outstanding</CardTitle>
            <CardDescription>Outstanding is what remains unpaid from each month&apos;s invoices.</CardDescription>
          </div>
          <FilterTabs
            value={months}
            onChange={setMonths}
            options={[
              { value: '6', label: '6 months' },
              { value: '12', label: '12 months' },
              { value: '24', label: '24 months' },
            ]}
          />
        </CardHeader>
        <CardContent className="grid gap-8 lg:grid-cols-2">
          {monthly.isPending ? (
            <Skeleton className="h-64 lg:col-span-2" />
          ) : (
            <>
              <MoneyBarChart
                title="Invoiced vs received by month"
                data={monthly.data ?? []}
                xKey="month"
                xFormat={monthLabel}
                series={[
                  { key: 'invoicedMinor', label: 'Invoiced', color: 'var(--chart-1)' },
                  { key: 'receivedMinor', label: 'Received', color: 'var(--chart-2)' },
                ]}
              />
              <div className="grid gap-2">
                <p className="text-sm font-medium">Outstanding by invoice month</p>
                <MoneyBarChart
                  title="Outstanding amount by invoice month"
                  data={monthly.data ?? []}
                  xKey="month"
                  xFormat={monthLabel}
                  series={[{ key: 'outstandingMinor', label: 'Outstanding', color: 'var(--chart-1)' }]}
                />
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <h2 className="mb-3 mt-8 text-lg font-semibold">Reconciliation</h2>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile label="Match rate" loading={!r} value={r ? percentFromBps(r.matchRateBps) : ''} hint={r && `${r.matchedTransactions} of ${r.creditTransactions} credits`} />
        <StatTile label="Matched automatically" loading={!r} value={r?.decisions.AUTO ?? 0} hint={r && `${r.decisions.APPROVED ?? 0} approved, ${r.decisions.MANUAL ?? 0} manual`} />
        <StatTile label="Open exceptions" loading={!r} value={r?.openExceptions ?? 0} hint={<Link href="/reconciliation" className="hover:underline">Review →</Link>} />
        <StatTile
          label="Average resolution time"
          loading={!r}
          value={r?.averageResolutionMinutes != null ? formatMinutes(r.averageResolutionMinutes) : '—'}
          hint="From exception opened to resolved"
        />
      </div>

      <div className="mt-8 grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Aging analysis</CardTitle>
            <CardDescription>Outstanding by days past due</CardDescription>
          </CardHeader>
          <Table>
            <THead>
              <TR>
                <TH>Bucket</TH>
                <TH className="text-right">Invoices</TH>
                <TH className="text-right">Amount</TH>
                <TH className="text-right">Share</TH>
              </TR>
            </THead>
            <TBody>
              {(aging.data?.buckets ?? []).map((b) => (
                <TR key={b.bucket}>
                  <TD>{humanize(b.bucket.replace('DAYS_', '').replace('_PLUS', '+').replace('_', '–'))}</TD>
                  <TD className="text-right tabular">{b.invoices}</TD>
                  <TD className="text-right tabular">{money(b.amountMinor)}</TD>
                  <TD className="text-right tabular text-muted-foreground">
                    {totalAging ? `${((b.amountMinor / totalAging) * 100).toFixed(1)}%` : '—'}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Top 10 customers by outstanding</CardTitle>
          </CardHeader>
          <Table>
            <THead>
              <TR>
                <TH>Customer</TH>
                <TH className="text-right">Overdue</TH>
                <TH className="text-right">Outstanding</TH>
              </TR>
            </THead>
            <TBody>
              {(top.data ?? []).map((c) => (
                <TR key={c.customerId}>
                  <TD>
                    <Link href={`/customers/${c.customerId}`} className="font-medium hover:underline">
                      {c.name}
                    </Link>
                    <p className="text-xs text-muted-foreground">{c.openInvoices} open invoices</p>
                  </TD>
                  <TD className="text-right tabular text-danger">{c.overdueMinor ? money(c.overdueMinor) : '—'}</TD>
                  <TD className="text-right font-medium tabular">{money(c.outstandingMinor)}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </Card>
      </div>
    </>
  );
}

function formatMinutes(minutes: number) {
  if (minutes < 60) return `${minutes} min`;
  if (minutes < 1440) return `${(minutes / 60).toFixed(1)} h`;
  return `${(minutes / 1440).toFixed(1)} days`;
}
