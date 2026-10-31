'use client';

import { Permission } from '@ledgerloop/shared-types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BellOff, BellRing, Ban, Download, Mail, MoreHorizontal, Pencil, Send, Wallet } from 'lucide-react';
import Link from 'next/link';
import { use, useState } from 'react';
import { toast } from 'sonner';
import { ActivityFeed } from '@/components/app/activity-feed';
import { PageHeader } from '@/components/app/page-header';
import { StatusBadge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/feedback';
import { Field, Input, Textarea } from '@/components/ui/input';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { api, apiPage, download } from '@/lib/api';
import { applyApiError } from '@/lib/auth';
import { date, dateTime, humanize, money, quantityToInput } from '@/lib/format';
import { useCan, useOrgQueryKey } from '@/lib/hooks';
import { useSession } from '@/lib/session';
import type { Allocation, Communication, Customer, Invoice } from '@/lib/types';

const OPEN = ['ISSUED', 'PARTIALLY_PAID', 'OVERDUE'];

export default function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const queryClient = useQueryClient();
  const organizationId = useSession((s) => s.organizationId);
  const canWrite = useCan(Permission.INVOICES_WRITE);
  const canIssue = useCan(Permission.INVOICES_ISSUE);
  const canVoid = useCan(Permission.INVOICES_VOID);
  const canPay = useCan(Permission.PAYMENTS_WRITE);
  const canCollect = useCan(Permission.COLLECTIONS_MANAGE);
  const canAudit = useCan(Permission.AUDIT_READ);
  const [dialog, setDialog] = useState<'send' | 'void' | null>(null);
  const [sendTo, setSendTo] = useState('');
  const [message, setMessage] = useState('');
  const [voidReason, setVoidReason] = useState('');

  const invoiceKey = useOrgQueryKey('invoices', id);
  const invoice = useQuery({ queryKey: invoiceKey, queryFn: () => api<Invoice & { customerId: Customer }>(`/invoices/${id}`) });
  const allocations = useQuery({
    queryKey: useOrgQueryKey('invoices', id, 'payments'),
    queryFn: () => api<Allocation[]>(`/invoices/${id}/payments`),
  });
  const emails = useQuery({
    queryKey: useOrgQueryKey('communications', id),
    queryFn: () => apiPage<Communication>('/communications', { query: { invoiceId: id, limit: 20 } }),
  });

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: [organizationId, 'invoices'] });
    void queryClient.invalidateQueries({ queryKey: [organizationId, 'communications'] });
  };
  const action = useMutation({
    mutationFn: ({ path, body }: { path: string; body?: unknown; success: string }) =>
      api(`${path}`, { method: 'POST', body }),
    onSuccess: (_, v) => {
      toast.success(v.success);
      setDialog(null);
      refresh();
    },
    onError: (e) => applyApiError(e),
  });

  if (invoice.isPending) return <Skeleton className="h-96" />;
  if (invoice.isError) return <ErrorState message={invoice.error.message} />;
  const inv = invoice.data;
  const customer = inv.customerSnapshot ?? inv.customerId;
  const customerId = typeof inv.customerId === 'object' ? inv.customerId.id : inv.customerId;
  const isOpen = OPEN.includes(inv.status);

  return (
    <>
      <PageHeader
        back={{ href: '/invoices', label: 'Invoices' }}
        title={
          <span className="flex flex-wrap items-center gap-3">
            {inv.invoiceNumber} <StatusBadge status={inv.status} />
            {inv.remindersPaused && (
              <span className="flex items-center gap-1 text-xs font-normal text-muted-foreground">
                <BellOff className="size-3.5" /> Reminders paused
              </span>
            )}
          </span>
        }
        description={`Issued ${date(inv.issueDate)} · Due ${date(inv.dueDate)}${inv.sentAt ? ` · Emailed ${dateTime(inv.sentAt)}` : ''}`}
        actions={
          <>
            <Button variant="outline" onClick={() => download(`/invoices/${id}/pdf`, `${inv.invoiceNumber}.pdf`).catch(applyApiError)}>
              <Download /> PDF
            </Button>
            {inv.status === 'DRAFT' && canWrite && (
              <Button variant="outline" asChild>
                <Link href={`/invoices/${id}/edit`}>
                  <Pencil /> Edit
                </Link>
              </Button>
            )}
            {inv.status === 'DRAFT' && canIssue && (
              <Button onClick={() => action.mutate({ path: `/invoices/${id}/issue`, success: 'Invoice issued' })} loading={action.isPending}>
                <Send /> Issue
              </Button>
            )}
            {isOpen && canIssue && (
              <Button
                variant="outline"
                onClick={() => {
                  setSendTo(typeof inv.customerId === 'object' ? (inv.customerId.email ?? '') : '');
                  setDialog('send');
                }}
              >
                <Mail /> Email
              </Button>
            )}
            {isOpen && canPay && (
              <Button asChild>
                <Link href={`/payments/new?customerId=${customerId}&invoiceId=${id}`}>
                  <Wallet /> Record payment
                </Link>
              </Button>
            )}
            {(canVoid || canCollect) && inv.status !== 'VOID' && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="icon" aria-label="More actions">
                    <MoreHorizontal />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  {canCollect && isOpen && (
                    <DropdownMenuItem
                      onSelect={() =>
                        action.mutate({
                          path: `/collections/invoices/${id}/${inv.remindersPaused ? 'resume' : 'pause'}`,
                          success: inv.remindersPaused ? 'Reminders resumed' : 'Reminders paused',
                        })
                      }
                    >
                      {inv.remindersPaused ? <BellRing /> : <BellOff />}
                      {inv.remindersPaused ? 'Resume reminders' : 'Pause reminders'}
                    </DropdownMenuItem>
                  )}
                  {canVoid && (
                    <DropdownMenuItem className="text-danger" onSelect={() => setDialog('void')}>
                      <Ban /> Void invoice
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </>
        }
      />

      {inv.status === 'VOID' && (
        <div className="mb-6 rounded-lg border border-danger/30 bg-danger-soft px-4 py-3 text-sm text-danger">
          This invoice was voided: {inv.voidReason}
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-[1fr_340px]">
        <div className="grid content-start gap-6">
          <Card>
            <CardContent className="grid gap-6 pt-5 sm:grid-cols-2">
              <div>
                <p className="text-xs font-medium uppercase text-muted-foreground">Bill to</p>
                <Link href={`/customers/${customerId}`} className="mt-1 block font-medium hover:underline">
                  {customer && 'name' in customer ? customer.name : ''}
                </Link>
                {customer && 'gstin' in customer && customer.gstin && (
                  <p className="text-sm text-muted-foreground">GSTIN {customer.gstin}</p>
                )}
              </div>
              <div className="sm:text-right">
                <p className="text-xs font-medium uppercase text-muted-foreground">Balance due</p>
                <p className="mt-1 text-3xl font-semibold tabular">{money(inv.outstandingMinor, inv.currency)}</p>
              </div>
            </CardContent>
            <Table>
              <THead>
                <TR>
                  <TH>Item</TH>
                  <TH className="text-right">Qty</TH>
                  <TH className="text-right">Rate</TH>
                  <TH className="text-right">GST</TH>
                  <TH className="text-right">Amount</TH>
                </TR>
              </THead>
              <TBody>
                {inv.items.map((item, i) => (
                  <TR key={i}>
                    <TD>{item.description}</TD>
                    <TD className="text-right tabular">{quantityToInput(item.quantityMilli)}</TD>
                    <TD className="text-right tabular">{money(item.unitPriceMinor, inv.currency)}</TD>
                    <TD className="text-right tabular">{item.taxRateBps / 100}%</TD>
                    <TD className="text-right tabular">{money(item.totalMinor, inv.currency)}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
            <dl className="ml-auto grid w-full max-w-xs gap-1.5 p-5 text-sm">
              {[
                ['Subtotal', inv.subtotalMinor],
                ['Discount', -inv.discountMinor],
                ['GST', inv.taxMinor],
              ].map(([l, v]) => (
                <div key={l as string} className="flex justify-between text-muted-foreground">
                  <dt>{l}</dt>
                  <dd className="tabular">{money(v as number, inv.currency)}</dd>
                </div>
              ))}
              <div className="flex justify-between border-t pt-2 font-semibold">
                <dt>Total</dt>
                <dd className="tabular">{money(inv.totalMinor, inv.currency)}</dd>
              </div>
              <div className="flex justify-between text-success">
                <dt>Paid</dt>
                <dd className="tabular">{money(inv.allocatedMinor, inv.currency)}</dd>
              </div>
            </dl>
            {(inv.notes || inv.terms) && (
              <div className="grid gap-4 border-t p-5 text-sm sm:grid-cols-2">
                {inv.notes && (
                  <div>
                    <p className="text-xs font-medium uppercase text-muted-foreground">Notes</p>
                    <p className="mt-1 whitespace-pre-line">{inv.notes}</p>
                  </div>
                )}
                {inv.terms && (
                  <div>
                    <p className="text-xs font-medium uppercase text-muted-foreground">Terms</p>
                    <p className="mt-1 whitespace-pre-line">{inv.terms}</p>
                  </div>
                )}
              </div>
            )}
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Payments applied</CardTitle>
            </CardHeader>
            {allocations.data?.length ? (
              <Table>
                <THead>
                  <TR>
                    <TH>Payment</TH>
                    <TH>Date</TH>
                    <TH>Method</TH>
                    <TH>Status</TH>
                    <TH className="text-right">Amount</TH>
                  </TR>
                </THead>
                <TBody>
                  {allocations.data.map((a) => (
                    <TR key={a.id}>
                      <TD>
                        <Link href={`/payments/${a.payment?.id}`} className="font-medium text-primary hover:underline">
                          {a.payment?.paymentNumber}
                        </Link>
                        {a.payment?.reference && <span className="ml-2 font-mono text-xs text-muted-foreground">{a.payment.reference}</span>}
                      </TD>
                      <TD>{date(a.payment?.paymentDate)}</TD>
                      <TD>{humanize(a.payment?.method ?? '')}</TD>
                      <TD>
                        <StatusBadge status={a.status} />
                      </TD>
                      <TD className={`text-right tabular ${a.status === 'REVERSED' ? 'text-muted-foreground line-through' : ''}`}>
                        {money(a.amountMinor, inv.currency)}
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            ) : (
              <EmptyState title="No payments applied yet" />
            )}
          </Card>
        </div>

        <div className="grid content-start gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Emails</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3">
              {emails.data?.items.length ? (
                emails.data.items.map((c) => (
                  <div key={c.id} className="flex items-start justify-between gap-3 text-sm">
                    <div className="min-w-0">
                      <p className="font-medium">{humanize(c.kind)}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {c.to} · {dateTime(c.sentAt ?? c.scheduledAt)}
                      </p>
                      {c.lastError && <p className="text-xs text-danger">{c.lastError}</p>}
                    </div>
                    <StatusBadge status={c.status} />
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">Nothing sent yet.</p>
              )}
            </CardContent>
          </Card>
          {canAudit && (
            <Card>
              <CardHeader>
                <CardTitle>Activity</CardTitle>
              </CardHeader>
              <CardContent>
                <ActivityFeed entityType="Invoice" entityId={id} />
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      <Dialog open={dialog === 'send'} onOpenChange={(o) => setDialog(o ? 'send' : null)}>
        <DialogContent title={`Email ${inv.invoiceNumber}`} description="The PDF is attached automatically.">
          <Field label="To" htmlFor="send-to">
            <Input id="send-to" type="email" value={sendTo} onChange={(e) => setSendTo(e.target.value)} />
          </Field>
          <Field label="Personal note (optional)" htmlFor="send-message">
            <Textarea id="send-message" rows={3} value={message} onChange={(e) => setMessage(e.target.value)} />
          </Field>
          <DialogFooter>
            <Button
              loading={action.isPending}
              onClick={() =>
                action.mutate({
                  path: `/invoices/${id}/send`,
                  body: { to: sendTo || undefined, message: message || undefined },
                  success: 'Invoice email queued',
                })
              }
            >
              <Send /> Send
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={dialog === 'void'} onOpenChange={(o) => setDialog(o ? 'void' : null)}>
        <DialogContent
          title={`Void ${inv.invoiceNumber}?`}
          description="Voiding keeps the invoice for audit but removes it from receivables. Invoices with payments must have them reversed first."
        >
          <Field label="Reason" htmlFor="void-reason">
            <Textarea id="void-reason" rows={2} value={voidReason} onChange={(e) => setVoidReason(e.target.value)} />
          </Field>
          <DialogFooter>
            <Button
              variant="danger"
              disabled={voidReason.trim().length < 3}
              loading={action.isPending}
              onClick={() => action.mutate({ path: `/invoices/${id}/void`, body: { reason: voidReason }, success: 'Invoice voided' })}
            >
              Void invoice
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
