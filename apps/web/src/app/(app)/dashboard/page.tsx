'use client';

import { Permission } from '@ledgerloop/shared-types';
import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  CircleDollarSign,
  FilePlus2,
  GitCompareArrows,
  Percent,
  Receipt,
  Upload,
  Wallet,
} from 'lucide-react';
import Link from 'next/link';
import { MoneyBarChart, monthLabel } from '@/components/charts';
import { PageHeader } from '@/components/app/page-header';
import { StatTile } from '@/components/app/stat-tile';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/feedback';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { api } from '@/lib/api';
import { humanize, money, percentFromBps } from '@/lib/format';
import { useCan, useCurrentMembership, useOrgQueryKey } from '@/lib/hooks';
import { useSession } from '@/lib/session';

interface Dashboard {
  currency: string;
  asOf: string;
  totalInvoicedMinor: number;
  totalReceivedMinor: number;
  totalOutstandingMinor: number;
  overdueMinor: number;
  overdueInvoices: number;
  partiallyPaidInvoices: number;
  unmatchedTransactions: number;
  collectionRateBps: number;
}

const AGING_LABELS: Record<string, string> = {
  NOT_DUE: 'Not due',
  DAYS_1_30: '1–30 days',
  DAYS_31_60: '31–60 days',
  DAYS_61_90: '61–90 days',
  DAYS_90_PLUS: '90+ days',
};

export default function DashboardPage() {
  const user = useSession((s) => s.user);
  const membership = useCurrentMembership();
  const canInvoice = useCan(Permission.INVOICES_WRITE);
  const canPay = useCan(Permission.PAYMENTS_WRITE);
  const canImport = useCan(Permission.IMPORTS_WRITE);

  const kpis = useQuery({
    queryKey: useOrgQueryKey('analytics', 'dashboard'),
    queryFn: () => api<Dashboard>('/analytics/dashboard'),
  });
  const monthly = useQuery({
    queryKey: useOrgQueryKey('analytics', 'collections'),
    queryFn: () =>
      api<{ month: string; invoicedMinor: number; receivedMinor: number }[]>('/analytics/collections', {
        query: { months: 12 },
      }),
  });
  const aging = useQuery({
    queryKey: useOrgQueryKey('analytics', 'aging'),
    queryFn: () => api<{ buckets: { bucket: string; amountMinor: number; invoices: number }[] }>('/analytics/aging'),
  });
  const top = useQuery({
    queryKey: useOrgQueryKey('analytics', 'customers'),
    queryFn: () =>
      api<{ customerId: string; name: string; outstandingMinor: number; overdueMinor: number; openInvoices: number }[]>(
        '/analytics/customers',
        { query: { limit: 5 } },
      ),
  });

  const k = kpis.data;
  const currency = k?.currency ?? membership?.organization.currency ?? 'INR';

  return (
    <>
      <PageHeader
        title={`Good ${greeting()}, ${user?.name.split(' ')[0] ?? ''}`}
        description={`Here is where ${membership?.organization.name ?? 'your business'} stands today.`}
        actions={
          <>
            {canImport && (
              <Button variant="outline" asChild>
                <Link href="/reconciliation/imports/new">
                  <Upload /> Import statement
                </Link>
              </Button>
            )}
            {canPay && (
              <Button variant="outline" asChild>
                <Link href="/payments/new">
                  <Wallet /> Record payment
                </Link>
              </Button>
            )}
            {canInvoice && (
              <Button asChild>
                <Link href="/invoices/new">
                  <FilePlus2 /> New invoice
                </Link>
              </Button>
            )}
          </>
        }
      />

      {kpis.isError ? (
        <ErrorState message={kpis.error.message} onRetry={() => kpis.refetch()} />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <StatTile
            label="Total outstanding"
            icon={CircleDollarSign}
            loading={kpis.isPending}
            value={money(k?.totalOutstandingMinor, currency)}
            hint={k && `${k.partiallyPaidInvoices} partially paid invoices`}
          />
          <StatTile
            label="Overdue"
            icon={AlertTriangle}
            tone="danger"
            loading={kpis.isPending}
            value={money(k?.overdueMinor, currency)}
            hint={
              k && (
                <Link href="/invoices?status=OVERDUE" className="hover:underline">
                  {k.overdueInvoices} overdue invoices →
                </Link>
              )
            }
          />
          <StatTile
            label="Payments received"
            icon={Wallet}
            tone="success"
            loading={kpis.isPending}
            value={money(k?.totalReceivedMinor, currency)}
            hint="All time"
          />
          <StatTile
            label="Total invoiced"
            icon={Receipt}
            loading={kpis.isPending}
            value={money(k?.totalInvoicedMinor, currency)}
            hint="Issued invoices, all time"
          />
          <StatTile
            label="Collection rate"
            icon={Percent}
            loading={kpis.isPending}
            value={k ? percentFromBps(k.collectionRateBps) : '—'}
            hint="Share of invoiced value collected"
          />
          <StatTile
            label="Unmatched bank credits"
            icon={GitCompareArrows}
            loading={kpis.isPending}
            value={k?.unmatchedTransactions ?? 0}
            hint={
              <Link href="/reconciliation" className="hover:underline">
                Review exceptions →
              </Link>
            }
          />
        </div>
      )}

      <div className="mt-6 grid gap-6 xl:grid-cols-5">
        <Card className="xl:col-span-3">
          <CardHeader>
            <CardTitle>Invoiced vs received</CardTitle>
            <CardDescription>Last 12 months</CardDescription>
          </CardHeader>
          <CardContent>
            {monthly.isPending ? (
              <Skeleton className="h-64" />
            ) : (
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
            )}
          </CardContent>
        </Card>
        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle>Outstanding by age</CardTitle>
            <CardDescription>Days past the due date</CardDescription>
          </CardHeader>
          <CardContent>
            {aging.isPending ? (
              <Skeleton className="h-64" />
            ) : (
              <MoneyBarChart
                title="Outstanding amount by aging bucket"
                data={(aging.data?.buckets ?? []).map((b) => ({ ...b, label: AGING_LABELS[b.bucket] ?? humanize(b.bucket) }))}
                xKey="label"
                series={[{ key: 'amountMinor', label: 'Outstanding', color: 'var(--chart-1)' }]}
              />
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Top customers by outstanding</CardTitle>
        </CardHeader>
        {top.isPending ? (
          <CardContent>
            <Skeleton className="h-40" />
          </CardContent>
        ) : (top.data ?? []).length === 0 ? (
          <EmptyState title="Nothing outstanding" description="Issued invoices with a balance will appear here." />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Customer</TH>
                <TH className="text-right">Open invoices</TH>
                <TH className="text-right">Overdue</TH>
                <TH className="text-right">Outstanding</TH>
              </TR>
            </THead>
            <TBody>
              {top.data!.map((c) => (
                <TR key={c.customerId}>
                  <TD>
                    <Link href={`/customers/${c.customerId}`} className="font-medium hover:underline">
                      {c.name}
                    </Link>
                  </TD>
                  <TD className="text-right tabular">{c.openInvoices}</TD>
                  <TD className="text-right tabular text-danger">{c.overdueMinor ? money(c.overdueMinor, currency) : '—'}</TD>
                  <TD className="text-right font-medium tabular">{money(c.outstandingMinor, currency)}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>
    </>
  );
}

function greeting() {
  const hour = new Date().getHours();
  return hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening';
}
