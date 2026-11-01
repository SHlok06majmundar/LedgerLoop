'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Ban, MoreHorizontal, Pencil, RotateCcw, Trash2 } from 'lucide-react';
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
import { Field, Input } from '@/components/ui/input';
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
  const [renaming, setRenaming] = useState<{ org: AdminOrg; name: string } | null>(null);
  const [deleting, setDeleting] = useState<AdminOrg | null>(null);
  const done = (message: string) => {
    toast.success(message);
    setRenaming(null);
    setDeleting(null);
    void queryClient.invalidateQueries({ queryKey: ['admin'] });
  };
  const update = useMutation({
    mutationFn: ({ org, body }: { org: AdminOrg; body: { name?: string; isSuspended?: boolean }; message: string }) =>
      api(`/admin/organizations/${org.id}`, { method: 'PATCH', body, noOrg: true }),
    onSuccess: (_, v) => done(v.message),
    onError: (e) => applyApiError(e),
  });
  const remove = useMutation({
    mutationFn: (org: AdminOrg) => api(`/admin/organizations/${org.id}`, { method: 'DELETE', noOrg: true }),
    onSuccess: (_, org) => done(`${org.name} deleted`),
    onError: (e) => applyApiError(e),
  });

  return (
    <>
      <PageHeader title="Organizations" description="Suspending blocks members until you restore it. Deleting removes it from LedgerLoop for good; its records are kept for audit." />
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
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button size="icon" variant="ghost" aria-label={`Actions for ${o.name}`}>
                            <MoreHorizontal />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent>
                          <DropdownMenuItem onSelect={() => setRenaming({ org: o, name: o.name })}>
                            <Pencil /> Rename
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onSelect={() =>
                              update.mutate({
                                org: o,
                                body: { isSuspended: !o.isSuspended },
                                message: o.isSuspended ? `${o.name} restored` : `${o.name} suspended`,
                              })
                            }
                          >
                            {o.isSuspended ? <RotateCcw /> : <Ban />} {o.isSuspended ? 'Restore access' : 'Suspend'}
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem className="text-danger" onSelect={() => setDeleting(o)}>
                            <Trash2 /> Delete organization
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
            <Pagination meta={orgs.data?.meta} onPage={setPage} />
          </>
        )}
      </Card>

      <Dialog open={renaming !== null} onOpenChange={(o) => !o && setRenaming(null)}>
        <DialogContent title="Rename organization" description="Members see the new name right away.">
          <Field label="Name" htmlFor="org-name">
            <Input
              id="org-name"
              value={renaming?.name ?? ''}
              onChange={(e) => setRenaming((r) => r && { ...r, name: e.target.value })}
            />
          </Field>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenaming(null)}>
              Cancel
            </Button>
            <Button
              disabled={!renaming || renaming.name.trim().length < 2}
              loading={update.isPending}
              onClick={() =>
                renaming &&
                update.mutate({ org: renaming.org, body: { name: renaming.name.trim() }, message: 'Organization renamed' })
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
        description="Every member loses access immediately and the organization disappears from all lists. Its invoices, payments and audit log are kept for the record."
        confirmText={deleting?.name ?? ''}
        actionLabel="Delete organization"
        loading={remove.isPending}
        onConfirm={() => deleting && remove.mutate(deleting)}
      />
    </>
  );
}
