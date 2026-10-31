'use client';

import { Permission } from '@ledgerloop/shared-types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, History, PlayCircle, Upload } from 'lucide-react';
import Link from 'next/link';
import { Suspense } from 'react';
import { toast } from 'sonner';
import { FilterTabs, Pagination, SearchInput, useListParams } from '@/components/app/list';
import { PageHeader } from '@/components/app/page-header';
import { ExceptionRow } from '@/components/reconciliation/exception-row';
import { MatchCard } from '@/components/reconciliation/match-card';
import { StatusBadge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState, ErrorState, TableSkeleton } from '@/components/ui/feedback';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { api, apiPage } from '@/lib/api';
import { applyApiError } from '@/lib/auth';
import { date, dateTime, humanize, money } from '@/lib/format';
import { useCan, useCurrentMembership, useOrgQueryKey } from '@/lib/hooks';
import { useSession } from '@/lib/session';
import type { BankTransaction, Match, Member, ReconException } from '@/lib/types';

const DEFAULTS = { view: 'exceptions', status: 'OPEN', search: '', txnStatus: '' };

interface Run {
  id: string;
  status: string;
  trigger: string;
  createdAt: string;
  completedAt: string | null;
  stats: Record<string, number>;
}

function ReconciliationWorkspace() {
  const queryClient = useQueryClient();
  const organizationId = useSession((s) => s.organizationId);
  const membership = useCurrentMembership();
  const canRun = useCan(Permission.RECONCILIATION_RUN);
  const canImport = useCan(Permission.IMPORTS_WRITE);
  const { values, page, set } = useListParams(DEFAULTS);

  const members = useQuery({
    queryKey: ['members', membership?.organization.id],
    queryFn: () => api<Member[]>(`/organizations/${membership!.organization.id}/members`, { noOrg: true }),
    enabled: Boolean(membership),
  });
  const exceptions = useQuery({
    queryKey: useOrgQueryKey('exceptions', values.status, page),
    queryFn: () => apiPage<ReconException>('/reconciliation/exceptions', { query: { status: values.status, page, limit: 25 } }),
    enabled: values.view === 'exceptions',
    placeholderData: (prev) => prev,
  });
  const suggestions = useQuery({
    queryKey: useOrgQueryKey('matches', 'SUGGESTED', page),
    queryFn: () => apiPage<Match>('/reconciliation/matches', { query: { status: 'SUGGESTED', page, limit: 10 } }),
    enabled: values.view === 'suggestions',
  });
  const transactions = useQuery({
    queryKey: useOrgQueryKey('bank-transactions', values.search, values.txnStatus, page),
    queryFn: () =>
      apiPage<BankTransaction>('/bank-transactions', {
        query: { search: values.search, status: values.txnStatus, page, limit: 25 },
      }),
    enabled: values.view === 'transactions',
    placeholderData: (prev) => prev,
  });
  const runs = useQuery({
    queryKey: useOrgQueryKey('runs', page),
    queryFn: () => apiPage<Run>('/reconciliation/runs', { query: { page, limit: 20 } }),
    enabled: values.view === 'runs',
  });

  const start = useMutation({
    mutationFn: () => api('/reconciliation/runs', { method: 'POST' }),
    onSuccess: () => {
      toast.success('Reconciliation started. Results appear in a moment.');
      setTimeout(() => void queryClient.invalidateQueries({ queryKey: [organizationId] }), 4000);
    },
    onError: (e) => applyApiError(e),
  });

  return (
    <>
      <PageHeader
        title="Reconciliation"
        description="Bank credits matched to payments and invoices, and the ones that need you."
        actions={
          <>
            <Button variant="outline" asChild>
              <Link href="/reconciliation/imports">
                <History /> Imports
              </Link>
            </Button>
            {canRun && (
              <Button variant="outline" onClick={() => start.mutate()} loading={start.isPending}>
                <PlayCircle /> Run matching
              </Button>
            )}
            {canImport && (
              <Button asChild>
                <Link href="/reconciliation/imports/new">
                  <Upload /> Import statement
                </Link>
              </Button>
            )}
          </>
        }
      />

      <div className="mb-4">
        <FilterTabs
          value={values.view}
          onChange={(view) => set({ view })}
          options={[
            { value: 'exceptions', label: 'Exceptions' },
            { value: 'suggestions', label: 'Suggested matches' },
            { value: 'transactions', label: 'Bank transactions' },
            { value: 'runs', label: 'Runs' },
          ]}
        />
      </div>

      {values.view === 'exceptions' && (
        <Card>
          <div className="flex items-center justify-between border-b p-4">
            <FilterTabs
              value={values.status}
              onChange={(status) => set({ status })}
              options={[
                { value: 'OPEN', label: 'Open' },
                { value: 'RESOLVED', label: 'Resolved' },
              ]}
            />
            <span className="text-sm text-muted-foreground tabular">{exceptions.data?.meta.total ?? 0} total</span>
          </div>
          {exceptions.isPending ? (
            <TableSkeleton />
          ) : exceptions.isError ? (
            <ErrorState message={exceptions.error.message} onRetry={() => exceptions.refetch()} />
          ) : exceptions.data.items.length === 0 ? (
            <EmptyState
              icon={CheckCircle2}
              title={values.status === 'OPEN' ? 'Nothing needs your attention' : 'No resolved exceptions yet'}
              description="Credits that cannot be matched confidently will appear here for review."
            />
          ) : (
            <>
              {exceptions.data.items.map((e) => (
                <ExceptionRow key={e.id} exception={e} members={members.data ?? []} />
              ))}
              <Pagination meta={exceptions.data.meta} onPage={(p) => set({ page: p })} />
            </>
          )}
        </Card>
      )}

      {values.view === 'suggestions' &&
        (suggestions.isPending ? (
          <TableSkeleton />
        ) : suggestions.data?.items.length ? (
          <div className="grid gap-4">
            {suggestions.data.items.map((m) => (
              <MatchCard key={m.id} match={m} />
            ))}
            <Pagination meta={suggestions.data.meta} onPage={(p) => set({ page: p })} />
          </div>
        ) : (
          <Card>
            <EmptyState icon={CheckCircle2} title="No suggestions waiting for approval" />
          </Card>
        ))}

      {values.view === 'transactions' && (
        <Card>
          <div className="flex flex-col gap-3 border-b p-4 sm:flex-row">
            <SearchInput value={values.search} onChange={(search) => set({ search })} placeholder="Search narration or reference" />
            <FilterTabs
              value={values.txnStatus}
              onChange={(txnStatus) => set({ txnStatus })}
              options={[
                { value: '', label: 'All' },
                { value: 'UNMATCHED', label: 'Unmatched' },
                { value: 'SUGGESTED', label: 'Suggested' },
                { value: 'MATCHED', label: 'Matched' },
                { value: 'DISCREPANCY', label: 'Discrepancy' },
                { value: 'IGNORED', label: 'Ignored' },
              ]}
            />
          </div>
          {transactions.isPending ? (
            <TableSkeleton />
          ) : transactions.data?.items.length ? (
            <>
              <Table>
                <THead>
                  <TR>
                    <TH>Date</TH>
                    <TH>Narration</TH>
                    <TH>Reference</TH>
                    <TH>Status</TH>
                    <TH className="text-right">Amount</TH>
                  </TR>
                </THead>
                <TBody>
                  {transactions.data.items.map((t) => (
                    <TR key={t.id}>
                      <TD className="whitespace-nowrap text-muted-foreground">{date(t.transactionDate)}</TD>
                      <TD className="max-w-md truncate font-mono text-xs" title={t.description}>
                        {t.description}
                      </TD>
                      <TD className="font-mono text-xs">{t.reference ?? '—'}</TD>
                      <TD>
                        <StatusBadge status={t.status} />
                      </TD>
                      <TD className={`text-right tabular ${t.direction === 'DEBIT' ? 'text-muted-foreground' : 'font-medium'}`}>
                        {t.direction === 'DEBIT' ? '−' : ''}
                        {money(t.amountMinor)}
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
              <Pagination meta={transactions.data.meta} onPage={(p) => set({ page: p })} />
            </>
          ) : (
            <EmptyState title="No bank transactions" description="Import a bank statement to get started." />
          )}
        </Card>
      )}

      {values.view === 'runs' && (
        <Card>
          {runs.isPending ? (
            <TableSkeleton />
          ) : runs.data?.items.length ? (
            <Table>
              <THead>
                <TR>
                  <TH>Started</TH>
                  <TH>Trigger</TH>
                  <TH>Status</TH>
                  <TH className="text-right">Examined</TH>
                  <TH className="text-right">Auto-matched</TH>
                  <TH className="text-right">Suggested</TH>
                  <TH className="text-right">Unmatched</TH>
                </TR>
              </THead>
              <TBody>
                {runs.data.items.map((r) => (
                  <TR key={r.id}>
                    <TD>{dateTime(r.createdAt)}</TD>
                    <TD>{humanize(r.trigger)}</TD>
                    <TD>
                      <StatusBadge status={r.status} />
                    </TD>
                    <TD className="text-right tabular">{r.stats.examined ?? 0}</TD>
                    <TD className="text-right tabular">{r.stats.matched ?? 0}</TD>
                    <TD className="text-right tabular">{(r.stats.suggested ?? 0) + (r.stats.partial ?? 0)}</TD>
                    <TD className="text-right tabular">{(r.stats.unmatched ?? 0) + (r.stats.discrepancy ?? 0)}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          ) : (
            <EmptyState title="No runs yet" />
          )}
        </Card>
      )}
    </>
  );
}

export default function ReconciliationPage() {
  return (
    <Suspense>
      <ReconciliationWorkspace />
    </Suspense>
  );
}
