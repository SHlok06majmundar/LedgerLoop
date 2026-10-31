'use client';

import { Permission } from '@ledgerloop/shared-types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MailPlus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Badge, StatusBadge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/feedback';
import { Field, Input, NativeSelect } from '@/components/ui/input';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { api } from '@/lib/api';
import { applyApiError } from '@/lib/auth';
import { date, humanize } from '@/lib/format';
import { useCan } from '@/lib/hooks';
import { useSession } from '@/lib/session';
import type { Member } from '@/lib/types';

const ROLES = ['ADMIN', 'ACCOUNTANT', 'MANAGER', 'STAFF', 'VIEWER'];
const ROLE_HELP: Record<string, string> = {
  ADMIN: 'Manage users, customers, invoices and payments',
  ACCOUNTANT: 'Invoices, payments and reconciliation',
  MANAGER: 'Analytics and approving matches',
  STAFF: 'Customers and draft invoices',
  VIEWER: 'Read-only access',
};

interface Invitation {
  id: string;
  email: string;
  role: string;
  expiresAt: string;
  invitedBy: { name: string } | null;
}

export function MembersSettings({ organizationId }: { organizationId: string }) {
  const queryClient = useQueryClient();
  const me = useSession((s) => s.user);
  const canManage = useCan(Permission.MEMBERS_MANAGE);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('ACCOUNTANT');
  const base = `/organizations/${organizationId}`;

  const members = useQuery({ queryKey: ['members', organizationId], queryFn: () => api<Member[]>(`${base}/members`, { noOrg: true }) });
  const invitations = useQuery({
    queryKey: ['invitations', organizationId],
    queryFn: () => api<Invitation[]>(`${base}/invitations`, { noOrg: true }),
    enabled: canManage,
  });
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['members', organizationId] });
    void queryClient.invalidateQueries({ queryKey: ['invitations', organizationId] });
  };
  const mutate = useMutation({
    mutationFn: ({ path, method, body }: { path: string; method: 'POST' | 'PATCH' | 'DELETE'; body?: unknown; done: string }) =>
      api(`${base}${path}`, { method, body, noOrg: true }),
    onSuccess: (_, v) => {
      toast.success(v.done);
      refresh();
    },
    onError: (e) => applyApiError(e),
  });

  return (
    <div className="grid gap-6">
      {canManage && (
        <Card>
          <CardHeader>
            <CardTitle>Invite a teammate</CardTitle>
            <CardDescription>They get an email link that expires in 7 days.</CardDescription>
          </CardHeader>
          <CardContent>
            <form
              className="grid gap-3 sm:grid-cols-[1fr_220px_auto] sm:items-end"
              onSubmit={(e) => {
                e.preventDefault();
                mutate.mutate({ path: '/invitations', method: 'POST', body: { email, role }, done: `Invitation sent to ${email}` });
                setEmail('');
              }}
            >
              <Field label="Email" htmlFor="invite-email">
                <Input id="invite-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
              </Field>
              <Field label="Role" htmlFor="invite-role" hint={ROLE_HELP[role]}>
                <NativeSelect id="invite-role" value={role} onChange={(e) => setRole(e.target.value)}>
                  {ROLES.map((r) => (
                    <option key={r} value={r}>
                      {humanize(r)}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
              <Button type="submit" className="sm:mb-5">
                <MailPlus /> Send invite
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Members</CardTitle>
        </CardHeader>
        {members.isPending ? (
          <CardContent>
            <Skeleton className="h-32" />
          </CardContent>
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Name</TH>
                <TH>Role</TH>
                <TH>Status</TH>
                <TH>Joined</TH>
                <TH />
              </TR>
            </THead>
            <TBody>
              {(members.data ?? []).map((m) => {
                const editable = canManage && m.role !== 'OWNER' && m.user?.id !== me?.id;
                return (
                  <TR key={m.id}>
                    <TD>
                      <p className="font-medium">
                        {m.user?.name} {m.user?.id === me?.id && <Badge className="ml-1">You</Badge>}
                      </p>
                      <p className="text-xs text-muted-foreground">{m.user?.email}</p>
                    </TD>
                    <TD>
                      {editable ? (
                        <NativeSelect
                          aria-label={`Role for ${m.user?.name}`}
                          className="h-8 w-36 text-xs"
                          value={m.role}
                          onChange={(e) =>
                            mutate.mutate({ path: `/members/${m.id}`, method: 'PATCH', body: { role: e.target.value }, done: 'Role updated' })
                          }
                        >
                          {ROLES.map((r) => (
                            <option key={r} value={r}>
                              {humanize(r)}
                            </option>
                          ))}
                        </NativeSelect>
                      ) : (
                        humanize(m.role)
                      )}
                    </TD>
                    <TD>
                      <StatusBadge status={m.status} />
                    </TD>
                    <TD className="text-muted-foreground">{date(m.joinedAt)}</TD>
                    <TD className="whitespace-nowrap text-right">
                      {editable && (
                        <>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() =>
                              mutate.mutate({
                                path: `/members/${m.id}`,
                                method: 'PATCH',
                                body: { status: m.status === 'ACTIVE' ? 'DISABLED' : 'ACTIVE' },
                                done: m.status === 'ACTIVE' ? 'Member disabled' : 'Member re-enabled',
                              })
                            }
                          >
                            {m.status === 'ACTIVE' ? 'Disable' : 'Enable'}
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            aria-label={`Remove ${m.user?.name}`}
                            onClick={() => mutate.mutate({ path: `/members/${m.id}`, method: 'DELETE', done: 'Member removed' })}
                          >
                            <Trash2 />
                          </Button>
                        </>
                      )}
                    </TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        )}
      </Card>

      {canManage && (invitations.data?.length ?? 0) > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Pending invitations</CardTitle>
          </CardHeader>
          <Table>
            <TBody>
              {invitations.data!.map((inv) => (
                <TR key={inv.id}>
                  <TD className="font-medium">{inv.email}</TD>
                  <TD>{humanize(inv.role)}</TD>
                  <TD className="text-muted-foreground">Expires {date(inv.expiresAt)}</TD>
                  <TD className="text-right">
                    <Button size="sm" variant="ghost" onClick={() => mutate.mutate({ path: `/invitations/${inv.id}`, method: 'DELETE', done: 'Invitation revoked' })}>
                      Revoke
                    </Button>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
