'use client';

import { Permission } from '@ledgerloop/shared-types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link2, Pencil, Undo2 } from 'lucide-react';
import Link from 'next/link';
import { use, useRef, useState } from 'react';
import { toast } from 'sonner';
import { ActivityFeed } from '@/components/app/activity-feed';
import { PageHeader } from '@/components/app/page-header';
import { StatTile } from '@/components/app/stat-tile';
import { AllocationEditor, allocationLines, type AllocationDraft } from '@/components/payments/allocation-editor';
import { EditPaymentDialog } from '@/components/payments/edit-payment-dialog';
import { StatusBadge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/feedback';
import { Field, Textarea } from '@/components/ui/input';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { api, newIdempotencyKey } from '@/lib/api';
import { applyApiError } from '@/lib/auth';
import { date, humanize, money } from '@/lib/format';
import { useCan, useOrgQueryKey } from '@/lib/hooks';
import { useSession } from '@/lib/session';
import { refId, refName, type Payment } from '@/lib/types';

export default function PaymentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const queryClient = useQueryClient();
  const organizationId = useSession((s) => s.organizationId);
  const canWrite = useCan(Permission.PAYMENTS_WRITE);
  const canReverse = useCan(Permission.PAYMENTS_REVERSE);
  const canAudit = useCan(Permission.AUDIT_READ);
  const [draft, setDraft] = useState<AllocationDraft>({});
  const [reversal, setReversal] = useState<{ allocationId?: string; label: string } | null>(null);
  const [reason, setReason] = useState('');
  const [editing, setEditing] = useState(false);
  const key = useRef(newIdempotencyKey());

  const payment = useQuery({ queryKey: useOrgQueryKey('payments', id), queryFn: () => api<Payment>(`/payments/${id}`) });

  const done = (message: string) => {
    toast.success(message);
    key.current = newIdempotencyKey();
    void queryClient.invalidateQueries({ queryKey: [organizationId] });
  };
  const allocate = useMutation({
    mutationFn: () =>
      api(`/payments/${id}/allocations`, {
        method: 'POST',
        idempotencyKey: key.current,
        body: { allocations: allocationLines(draft) },
      }),
    onSuccess: () => {
      setDraft({});
      done('Payment allocated');
    },
    onError: (e) => {
      key.current = newIdempotencyKey();
      applyApiError(e);
    },
  });
  const reverse = useMutation({
    mutationFn: () =>
      api(`/payments/${id}/reversals`, {
        method: 'POST',
        idempotencyKey: key.current,
        body: { allocationId: reversal?.allocationId, reason },
      }),
    onSuccess: () => {
      setReversal(null);
      setReason('');
      done('Reversal recorded');
    },
    onError: (e) => {
      key.current = newIdempotencyKey();
      applyApiError(e);
    },
  });

  if (payment.isPending) return <Skeleton className="h-96" />;
  if (payment.isError) return <ErrorState message={payment.error.message} />;
  const p = payment.data;
  const posted = p.status === 'POSTED';
  const lines = allocationLines(draft);

  return (
    <>
      <PageHeader
        back={{ href: '/payments', label: 'Payments' }}
        title={
          <span className="flex items-center gap-3">
            {p.paymentNumber} <StatusBadge status={p.status} />
          </span>
        }
        description={
          <>
            <Link href={`/customers/${refId(p.customerId)}`} className="hover:underline">
              {refName(p.customerId)}
            </Link>{' '}
            · {humanize(p.method)} · {date(p.paymentDate)}
            {p.reference && <span className="ml-1 font-mono text-xs"> · {p.reference}</span>}
          </>
        }
        actions={
          posted && (
            <>
              {canWrite && (
                <Button variant="outline" onClick={() => setEditing(true)}>
                  <Pencil /> Edit details
                </Button>
              )}
              {canReverse && (
                <Button variant="outline" onClick={() => setReversal({ label: 'the whole payment' })}>
                  <Undo2 /> Reverse payment
                </Button>
              )}
            </>
          )
        }
      />

      {p.status === 'REVERSED' && (
        <div className="mb-6 rounded-lg border border-danger/30 bg-danger-soft px-4 py-3 text-sm text-danger">
          Reversed: {p.reversalReason}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <StatTile label="Amount" value={money(p.amountMinor)} />
        <StatTile label="Allocated" value={money(p.allocatedMinor)} />
        <StatTile
          label="Unallocated"
          value={money(p.unallocatedMinor)}
          hint={
            p.bankTransactionId ? (
              <span className="flex items-center gap-1 text-success">
                <Link2 className="size-3.5" /> Reconciled with bank statement
              </span>
            ) : (
              'Not yet matched to a bank line'
            )
          }
        />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.3fr_1fr]">
        <div className="grid content-start gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Allocations</CardTitle>
            </CardHeader>
            {p.allocations?.length ? (
              <Table>
                <THead>
                  <TR>
                    <TH>Invoice</TH>
                    <TH>Applied</TH>
                    <TH>Status</TH>
                    <TH className="text-right">Amount</TH>
                    <TH />
                  </TR>
                </THead>
                <TBody>
                  {p.allocations.map((a) => {
                    const invoice = typeof a.invoiceId === 'object' ? a.invoiceId : null;
                    return (
                      <TR key={a.id}>
                        <TD>
                          <Link href={`/invoices/${invoice?.id}`} className="font-medium text-primary hover:underline">
                            {invoice?.invoiceNumber}
                          </Link>
                        </TD>
                        <TD className="text-muted-foreground">{date(a.createdAt)}</TD>
                        <TD>
                          <StatusBadge status={a.status} />
                          {a.reversalReason && <p className="mt-1 text-xs text-muted-foreground">{a.reversalReason}</p>}
                        </TD>
                        <TD className={`text-right tabular ${a.status === 'REVERSED' ? 'text-muted-foreground line-through' : ''}`}>
                          {money(a.amountMinor)}
                        </TD>
                        <TD className="text-right">
                          {a.status === 'ACTIVE' && canReverse && (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setReversal({ allocationId: a.id, label: `the allocation to ${invoice?.invoiceNumber}` })}
                            >
                              Reverse
                            </Button>
                          )}
                        </TD>
                      </TR>
                    );
                  })}
                </TBody>
              </Table>
            ) : (
              <EmptyState title="Not allocated to any invoice yet" />
            )}
          </Card>

          {posted && canWrite && p.unallocatedMinor > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Allocate remaining {money(p.unallocatedMinor)}</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4">
                <AllocationEditor
                  customerId={refId(p.customerId)}
                  availableMinor={p.unallocatedMinor}
                  draft={draft}
                  onChange={setDraft}
                />
                <Button
                  className="justify-self-end"
                  disabled={!lines?.length}
                  loading={allocate.isPending}
                  onClick={() => allocate.mutate()}
                >
                  Apply allocations
                </Button>
              </CardContent>
            </Card>
          )}
        </div>

        <div className="grid content-start gap-6">
          {p.notes && (
            <Card>
              <CardHeader>
                <CardTitle>Notes</CardTitle>
              </CardHeader>
              <CardContent className="whitespace-pre-line text-sm">{p.notes}</CardContent>
            </Card>
          )}
          {canAudit && (
            <Card>
              <CardHeader>
                <CardTitle>History</CardTitle>
              </CardHeader>
              <CardContent>
                <ActivityFeed entityType="Payment" entityId={id} />
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {editing && <EditPaymentDialog payment={p} open={editing} onOpenChange={setEditing} />}

      <Dialog open={reversal !== null} onOpenChange={(o) => !o && setReversal(null)}>
        <DialogContent
          title={`Reverse ${reversal?.label}?`}
          description="Reversals are recorded permanently and release the amount back to the invoices. The original entries stay in the audit trail."
        >
          <Field label="Reason" htmlFor="reverse-reason">
            <Textarea id="reverse-reason" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Cheque bounced, applied to wrong invoice" />
          </Field>
          <DialogFooter>
            <Button variant="danger" disabled={reason.trim().length < 3} loading={reverse.isPending} onClick={() => reverse.mutate()}>
              Record reversal
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
