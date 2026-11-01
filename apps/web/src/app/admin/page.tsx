'use client';

import { useQuery } from '@tanstack/react-query';
import { Building2, FileText, UserCheck, Users, Wallet } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { monthLabel } from '@/components/charts';
import { PageHeader } from '@/components/app/page-header';
import { StatTile } from '@/components/app/stat-tile';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ErrorState, Skeleton } from '@/components/ui/feedback';
import { api } from '@/lib/api';
import { compactMoney } from '@/lib/format';

interface PlatformStats {
  organizations: number;
  suspendedOrganizations: number;
  users: number;
  activeUsersLast30Days: number;
  newUsersLast30Days: number;
  issuedInvoices: number;
  issuedInvoiceValueMinor: number;
  postedPayments: number;
  postedPaymentValueMinor: number;
  signupsByMonth: { month: string; count: number }[];
}

export default function AdminOverviewPage() {
  const stats = useQuery({ queryKey: ['admin', 'stats'], queryFn: () => api<PlatformStats>('/admin/stats', { noOrg: true }) });
  if (stats.isError) return <ErrorState message={stats.error.message} onRetry={() => stats.refetch()} />;
  const s = stats.data;

  return (
    <>
      <PageHeader title="Platform overview" description="Every organization and user on LedgerLoop." />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile label="Organizations" icon={Building2} loading={!s} value={s?.organizations} hint={s && `${s.suspendedOrganizations} suspended`} />
        <StatTile label="Users" icon={Users} loading={!s} value={s?.users} hint={s && `${s.newUsersLast30Days} joined in the last 30 days`} />
        <StatTile label="Active users (30 days)" icon={UserCheck} loading={!s} value={s?.activeUsersLast30Days} />
        <StatTile label="Issued invoices" icon={FileText} loading={!s} value={s?.issuedInvoices} hint={s && `${compactMoney(s.issuedInvoiceValueMinor)} invoiced`} />
        <StatTile label="Posted payments" icon={Wallet} loading={!s} value={s?.postedPayments} hint={s && `${compactMoney(s.postedPaymentValueMinor)} collected`} />
      </div>
      <Card className="mt-6">
        <CardHeader>
          <CardTitle>New users by month</CardTitle>
          <CardDescription>Last six months</CardDescription>
        </CardHeader>
        <CardContent>
          {!s ? (
            <Skeleton className="h-56" />
          ) : (
            <div className="h-56" role="img" aria-label="New users by month">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={s.signupsByMonth}>
                  <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
                  <XAxis dataKey="month" tickFormatter={monthLabel} tickLine={false} axisLine={false} tick={{ fill: 'var(--chart-axis)', fontSize: 11 }} />
                  <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={32} tick={{ fill: 'var(--chart-axis)', fontSize: 11 }} />
                  <Tooltip
                    cursor={{ fill: 'var(--muted)', opacity: 0.6 }}
                    labelFormatter={(l) => monthLabel(String(l))}
                    formatter={(v) => [v, 'New users']}
                    contentStyle={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }}
                  />
                  <Bar dataKey="count" fill="var(--chart-1)" radius={[4, 4, 0, 0]} maxBarSize={28} isAnimationActive={false} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
}
