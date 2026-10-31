'use client';

import { Permission } from '@ledgerloop/shared-types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BellRing, PlayCircle, RotateCw, Send, X } from 'lucide-react';
import { Suspense, useState } from 'react';
import { toast } from 'sonner';
import { FilterTabs, Pagination, useListParams } from '@/components/app/list';
import { PageHeader } from '@/components/app/page-header';
import { NewReminderDialog } from '@/components/collections/new-reminder-dialog';
import { ScheduleEditor } from '@/components/collections/schedule-editor';
import { StatusBadge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState, TableSkeleton } from '@/components/ui/feedback';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { api, apiPage } from '@/lib/api';
import { applyApiError } from '@/lib/auth';
import { dateTime, humanize } from '@/lib/format';
import { useCan, useOrgQueryKey } from '@/lib/hooks';
import { useSession } from '@/lib/session';
import type { Communication } from '@/lib/types';

const DEFAULTS = { status: '' };

function Collections() {
  const queryClient = useQueryClient();
  const organizationId = useSession((s) => s.organizationId);
  const canManage = useCan(Permission.COLLECTIONS_MANAGE);
  const [composing, setComposing] = useState(false);
  const { values, page, set } = useListParams(DEFAULTS);

  const reminders = useQuery({
    queryKey: useOrgQueryKey('reminders', values.status, page),
    queryFn: () => apiPage<Communication>('/collections/reminders', { query: { status: values.status, page, limit: 20 } }),
    placeholderData: (prev) => prev,
  });
  const refresh = () => queryClient.invalidateQueries({ queryKey: [organizationId, 'reminders'] });
  const act = useMutation({
    mutationFn: ({ path, method, body }: { path: string; method: 'POST' | 'PATCH'; body?: unknown; done: string }) =>
      api(path, { method, body }),
    onSuccess: (_, v) => {
      toast.success(v.done);
      void refresh();
    },
    onError: (e) => applyApiError(e),
  });

  return (
    <>
      <PageHeader
        title="Collections"
        description="Reminders that follow up on unpaid invoices for you."
        actions={
          canManage && (
            <>
              <Button
                variant="outline"
                loading={act.isPending && act.variables?.path === '/collections/run'}
                onClick={() => act.mutate({ path: '/collections/run', method: 'POST', done: 'Due reminders queued' })}
              >
                <PlayCircle /> Run now
              </Button>
              <Button onClick={() => setComposing(true)}>
                <Send /> Send reminder
              </Button>
            </>
          )
        }
      />
      <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
        <Card>
          <div className="border-b p-4">
            <FilterTabs
              value={values.status}
              onChange={(status) => set({ status })}
              options={[
                { value: '', label: 'All' },
                { value: 'SCHEDULED', label: 'Scheduled' },
                { value: 'SENT', label: 'Sent' },
                { value: 'FAILED', label: 'Failed' },
                { value: 'CANCELLED', label: 'Cancelled' },
              ]}
            />
          </div>
          {reminders.isPending ? (
            <TableSkeleton />
          ) : reminders.data?.items.length ? (
            <>
              <Table>
                <THead>
                  <TR>
                    <TH>Customer</TH>
                    <TH>Type</TH>
                    <TH>Invoices</TH>
                    <TH>When</TH>
                    <TH>Status</TH>
                    <TH />
                  </TR>
                </THead>
                <TBody>
                  {reminders.data.items.map((r) => (
                    <TR key={r.id}>
                      <TD>
                        <p className="font-medium">{r.customerId?.name}</p>
                        <p className="text-xs text-muted-foreground">{r.to}</p>
                      </TD>
                      <TD>{humanize(r.kind)}</TD>
                      <TD className="text-xs">{r.invoiceIds.map((i) => i.invoiceNumber).join(', ')}</TD>
                      <TD className="whitespace-nowrap text-muted-foreground">{dateTime(r.sentAt ?? r.scheduledAt)}</TD>
                      <TD>
                        <StatusBadge status={r.status} />
                        {r.lastError && <p className="mt-1 max-w-48 truncate text-xs text-danger" title={r.lastError}>{r.lastError}</p>}
                      </TD>
                      <TD className="whitespace-nowrap text-right">
                        {canManage && r.status === 'FAILED' && (
                          <Button size="sm" variant="ghost" onClick={() => act.mutate({ path: `/communications/${r.id}/retry`, method: 'POST', done: 'Retrying' })}>
                            <RotateCw /> Retry
                          </Button>
                        )}
                        {canManage && r.status === 'SCHEDULED' && (
                          <>
                            <Button size="sm" variant="ghost" onClick={() => act.mutate({ path: `/collections/reminders/${r.id}/send`, method: 'POST', done: 'Sending now' })}>
                              <Send /> Send now
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              aria-label="Cancel reminder"
                              onClick={() =>
                                act.mutate({ path: `/collections/reminders/${r.id}`, method: 'PATCH', body: { status: 'CANCELLED' }, done: 'Reminder cancelled' })
                              }
                            >
                              <X />
                            </Button>
                          </>
                        )}
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
              <Pagination meta={reminders.data.meta} onPage={(p) => set({ page: p })} />
            </>
          ) : (
            <EmptyState icon={BellRing} title="No reminders yet" description="Automated reminders appear here once invoices approach their due dates." />
          )}
        </Card>
        <ScheduleEditor canEdit={canManage} />
      </div>
      {composing && <NewReminderDialog open={composing} onOpenChange={setComposing} />}
    </>
  );
}

export default function CollectionsPage() {
  return (
    <Suspense>
      <Collections />
    </Suspense>
  );
}
