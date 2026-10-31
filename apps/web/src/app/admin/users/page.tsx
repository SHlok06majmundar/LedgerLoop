'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ShieldCheck } from 'lucide-react';
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
import { date, dateTime } from '@/lib/format';
import { useSession } from '@/lib/session';

interface AdminUser {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  isActive: boolean;
  isSuperAdmin: boolean;
  createdAt: string;
  lastLoginAt: string | null;
  organizations: number;
}

export default function AdminUsersPage() {
  const queryClient = useQueryClient();
  const me = useSession((s) => s.user);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const users = useQuery({
    queryKey: ['admin', 'users', search, page],
    queryFn: () => apiPage<AdminUser>('/admin/users', { query: { search, page, limit: 25 }, noOrg: true }),
    placeholderData: (prev) => prev,
  });
  const toggle = useMutation({
    mutationFn: (u: AdminUser) => api(`/admin/users/${u.id}`, { method: 'PATCH', body: { isActive: !u.isActive }, noOrg: true }),
    onSuccess: (_, u) => {
      toast.success(u.isActive ? `${u.name} deactivated and signed out` : `${u.name} reactivated`);
      void queryClient.invalidateQueries({ queryKey: ['admin'] });
    },
    onError: (e) => applyApiError(e),
  });

  return (
    <>
      <PageHeader title="Users" description="Deactivating a user ends all of their sessions at once." />
      <Card>
        <div className="border-b p-4">
          <SearchInput
            value={search}
            onChange={(v) => {
              setSearch(v);
              setPage(1);
            }}
            placeholder="Search name or email"
          />
        </div>
        {users.isPending ? (
          <TableSkeleton cols={6} />
        ) : (
          <>
            <Table>
              <THead>
                <TR>
                  <TH>User</TH>
                  <TH className="text-right">Organizations</TH>
                  <TH>Last sign-in</TH>
                  <TH>Joined</TH>
                  <TH>Status</TH>
                  <TH />
                </TR>
              </THead>
              <TBody>
                {users.data?.items.map((u) => (
                  <TR key={u.id}>
                    <TD>
                      <p className="flex items-center gap-1.5 font-medium">
                        {u.name}
                        {u.isSuperAdmin && <ShieldCheck className="size-4 text-primary" aria-label="Super Admin" />}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {u.email} {!u.emailVerified && '· unverified'}
                      </p>
                    </TD>
                    <TD className="text-right tabular">{u.organizations}</TD>
                    <TD className="text-muted-foreground">{dateTime(u.lastLoginAt)}</TD>
                    <TD className="text-muted-foreground">{date(u.createdAt)}</TD>
                    <TD>{u.isActive ? <Badge tone="success">Active</Badge> : <Badge>Deactivated</Badge>}</TD>
                    <TD className="text-right">
                      {u.id !== me?.id && (
                        <Button size="sm" variant="ghost" loading={toggle.isPending && toggle.variables?.id === u.id} onClick={() => toggle.mutate(u)}>
                          {u.isActive ? 'Deactivate' : 'Reactivate'}
                        </Button>
                      )}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
            <Pagination meta={users.data?.meta} onPage={setPage} />
          </>
        )}
      </Card>
    </>
  );
}
