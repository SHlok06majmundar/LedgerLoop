'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';
import { Pagination, SearchInput } from '@/components/app/list';
import { PageHeader } from '@/components/app/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { TableSkeleton } from '@/components/ui/feedback';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { api, apiPage } from '@/lib/api';
import { applyApiError } from '@/lib/auth';
import { date, money } from '@/lib/format';

interface AdminOrg {
  id: string;
  name: string;
  slug: string;
  currency: string;
  isSuspended: boolean;
  createdAt: string;
  members: number;
  invoices: number;
  outstandingMinor: number;
  owner: { name?: string; email?: string };
}

export default function AdminOrganizationsPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const orgs = useQuery({
    queryKey: ['admin', 'organizations', search, page],
    queryFn: () => apiPage<AdminOrg>('/admin/organizations', { query: { search, page, limit: 25 }, noOrg: true }),
    placeholderData: (prev) => prev,
  });
  const toggle = useMutation({
    mutationFn: (org: AdminOrg) =>
      api(`/admin/organizations/${org.id}`, { method: 'PATCH', body: { isSuspended: !org.isSuspended }, noOrg: true }),
    onSuccess: (_, org) => {
      toast.success(org.isSuspended ? `${org.name} restored` : `${org.name} suspended`);
      void queryClient.invalidateQueries({ queryKey: ['admin'] });
    },
    onError: (e) => applyApiError(e),
  });

  return (
    <>
      <PageHeader title="Organizations" description="Suspending an organization immediately blocks its members." />
      <Card>
        <div className="border-b p-4">
          <SearchInput
            value={search}
            onChange={(v) => {
              setSearch(v);
              setPage(1);
            }}
            placeholder="Search organizations"
          />
        </div>
        {orgs.isPending ? (
          <TableSkeleton cols={6} />
        ) : (
          <>
            <Table>
              <THead>
                <TR>
                  <TH>Organization</TH>
                  <TH>Owner</TH>
                  <TH className="text-right">Members</TH>
                  <TH className="text-right">Invoices</TH>
                  <TH className="text-right">Outstanding</TH>
                  <TH>Created</TH>
                  <TH />
                </TR>
              </THead>
              <TBody>
                {orgs.data?.items.map((o) => (
                  <TR key={o.id}>
                    <TD>
                      <p className="font-medium">
                        {o.name} {o.isSuspended && <Badge tone="danger">Suspended</Badge>}
                      </p>
                      <p className="text-xs text-muted-foreground">{o.slug}</p>
                    </TD>
                    <TD>
                      <p>{o.owner.name}</p>
                      <p className="text-xs text-muted-foreground">{o.owner.email}</p>
                    </TD>
                    <TD className="text-right tabular">{o.members}</TD>
                    <TD className="text-right tabular">{o.invoices}</TD>
                    <TD className="text-right tabular">{money(o.outstandingMinor, o.currency)}</TD>
                    <TD className="text-muted-foreground">{date(o.createdAt)}</TD>
                    <TD className="text-right">
                      <Button size="sm" variant={o.isSuspended ? 'outline' : 'ghost'} loading={toggle.isPending && toggle.variables?.id === o.id} onClick={() => toggle.mutate(o)}>
                        {o.isSuspended ? 'Restore' : 'Suspend'}
                      </Button>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
            <Pagination meta={orgs.data?.meta} onPage={setPage} />
          </>
        )}
      </Card>
    </>
  );
}
