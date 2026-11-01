'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MoreHorizontal, Pencil, ShieldCheck, Trash2, UserCheck, UserX } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { ConfirmDeleteDialog } from '@/components/admin/confirm-delete-dialog';
import { Pagination, SearchInput } from '@/components/app/list';
import { PageHeader } from '@/components/app/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { TableSkeleton } from '@/components/ui/feedback';
import { Field, Input, Label } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
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
  const [editing, setEditing] = useState<{ user: AdminUser; name: string; isSuperAdmin: boolean } | null>(null);
  const [deleting, setDeleting] = useState<AdminUser | null>(null);
  const done = (message: string) => {
    toast.success(message);
    setEditing(null);
    setDeleting(null);
    void queryClient.invalidateQueries({ queryKey: ['admin'] });
  };
  const update = useMutation({
    mutationFn: ({ user, body }: { user: AdminUser; body: Partial<Pick<AdminUser, 'name' | 'isActive' | 'isSuperAdmin'>>; message: string }) =>
      api(`/admin/users/${user.id}`, { method: 'PATCH', body, noOrg: true }),
    onSuccess: (_, v) => done(v.message),
    onError: (e) => applyApiError(e),
  });
  const remove = useMutation({
    mutationFn: (user: AdminUser) => api(`/admin/users/${user.id}`, { method: 'DELETE', noOrg: true }),
    onSuccess: (_, user) => done(`${user.name} deleted`),
    onError: (e) => applyApiError(e),
  });

  return (
    <>
      <PageHeader title="Users" description="Deactivating signs a user out everywhere until you reactivate them. Deleting also frees their email address." />
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
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button size="icon" variant="ghost" aria-label={`Actions for ${u.name}`}>
                            <MoreHorizontal />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent>
                          <DropdownMenuItem onSelect={() => setEditing({ user: u, name: u.name, isSuperAdmin: u.isSuperAdmin })}>
                            <Pencil /> Edit
                          </DropdownMenuItem>
                          {u.id !== me?.id && (
                            <>
                              <DropdownMenuItem
                                onSelect={() =>
                                  update.mutate({
                                    user: u,
                                    body: { isActive: !u.isActive },
                                    message: u.isActive ? `${u.name} deactivated and signed out` : `${u.name} reactivated`,
                                  })
                                }
                              >
                                {u.isActive ? <UserX /> : <UserCheck />} {u.isActive ? 'Deactivate' : 'Reactivate'}
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem className="text-danger" onSelect={() => setDeleting(u)}>
                                <Trash2 /> Delete user
                              </DropdownMenuItem>
                            </>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
            <Pagination meta={users.data?.meta} onPage={setPage} />
          </>
        )}
      </Card>

      <Dialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent title="Edit user" description={editing?.user.email}>
          <Field label="Name" htmlFor="user-name">
            <Input
              id="user-name"
              value={editing?.name ?? ''}
              onChange={(e) => setEditing((v) => v && { ...v, name: e.target.value })}
            />
          </Field>
          <div className="flex items-center justify-between gap-4 rounded-lg border p-3">
            <div>
              <Label htmlFor="user-super-admin">Super Admin</Label>
              <p className="text-xs text-muted-foreground">
                {editing?.user.id === me?.id ? 'You cannot remove your own access.' : 'Full access to this admin panel.'}
              </p>
            </div>
            <Switch
              id="user-super-admin"
              checked={editing?.isSuperAdmin ?? false}
              disabled={editing?.user.id === me?.id}
              onCheckedChange={(checked) => setEditing((v) => v && { ...v, isSuperAdmin: checked })}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button
              disabled={!editing || editing.name.trim().length < 2}
              loading={update.isPending}
              onClick={() =>
                editing &&
                update.mutate({
                  user: editing.user,
                  body: {
                    name: editing.name.trim(),
                    ...(editing.user.id === me?.id ? {} : { isSuperAdmin: editing.isSuperAdmin }),
                  },
                  message: 'User updated',
                })
              }
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDeleteDialog
        open={deleting !== null}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={`Delete ${deleting?.name ?? ''}?`}
        description="They are signed out everywhere and their email is freed so it can sign up again. Organizations only they belong to are deleted too; an owner of a team must hand it over first."
        confirmText={deleting?.email ?? ''}
        actionLabel="Delete user"
        loading={remove.isPending}
        onConfirm={() => deleting && remove.mutate(deleting)}
      />
    </>
  );
}
