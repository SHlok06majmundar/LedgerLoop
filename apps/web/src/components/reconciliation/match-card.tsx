'use client';

import { Permission } from '@ledgerloop/shared-types';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertOctagon, Check, X } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { toast } from 'sonner';
import { Badge, StatusBadge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { api } from '@/lib/api';
import { applyApiError } from '@/lib/auth';
import { date, humanize, money } from '@/lib/format';
import { useCan } from '@/lib/hooks';
import { useSession } from '@/lib/session';
import type { Match } from '@/lib/types';
import { cn } from '@/lib/utils';

const BLOCK_TEXT: Record<string, string> = {
  REFERENCE_CONFLICT: 'Bank reference differs from the payment reference',
  AMOUNT_MISMATCH: 'Amounts differ',
  OVER_ALLOCATION: 'Transfer is larger than what is owed',
  AMBIGUOUS: 'Another candidate scored almost as high',
};

/** A suggested match with its score, the reasons behind it and approve/reject actions. */
export function MatchCard({ match }: { match: Match }) {
  const queryClient = useQueryClient();
  const organizationId = useSession((s) => s.organizationId);
  const canApprove = useCan(Permission.RECONCILIATION_APPROVE);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');
  const txn = match.bankTransactionId;
  const pending = !match.decision && ['SUGGESTED', 'PARTIALLY_MATCHED', 'DISCREPANCY'].includes(match.status);

  const decide = useMutation({
    mutationFn: (approve: boolean) =>
      api(`/reconciliation/matches/${match.id}/${approve ? 'approve' : 'reject'}`, {
        method: 'POST',
        body: approve ? undefined : { reason },
      }),
    onSuccess: (_, approve) => {
      toast.success(approve ? 'Match approved and payment applied' : 'Suggestion rejected');
      void queryClient.invalidateQueries({ queryKey: [organizationId] });
    },
    onError: (e) => applyApiError(e),
  });

  return (
    <Card className="overflow-hidden">
      <div className="grid gap-4 p-5 md:grid-cols-[1fr_auto_1fr]">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase text-muted-foreground">Bank credit · {date(txn.transactionDate)}</p>
          <p className="mt-1 text-lg font-semibold tabular">{money(txn.amountMinor)}</p>
          <p className="truncate font-mono text-xs text-muted-foreground" title={txn.description}>
            {txn.description}
          </p>
          {txn.reference && <p className="font-mono text-xs text-muted-foreground">Ref {txn.reference}</p>}
        </div>
        <div className="flex flex-col items-center justify-center">
          <div
            className={cn(
              'flex size-14 items-center justify-center rounded-full border-4 text-sm font-semibold tabular',
              match.score >= 90 ? 'border-success text-success' : match.score >= 70 ? 'border-info text-info' : 'border-warning text-warning',
            )}
            aria-label={`Confidence score ${match.score} out of 100`}
          >
            {match.score}
          </div>
          <StatusBadge status={match.status} className="mt-2" />
        </div>
        <div className="min-w-0 md:text-right">
          <p className="text-xs font-medium uppercase text-muted-foreground">{humanize(match.kind)}</p>
          <p className="mt-1 font-medium">{match.customerId?.name ?? '—'}</p>
          {match.paymentId ? (
            <Link href={`/payments/${match.paymentId.id}`} className="text-sm text-primary hover:underline">
              {match.paymentId.paymentNumber} · {money(match.paymentId.amountMinor)}
            </Link>
          ) : (
            <div className="flex flex-wrap gap-1 md:justify-end">
              {match.invoiceIds.map((inv, i) => (
                <Link key={inv.id} href={`/invoices/${inv.id}`} className="text-sm text-primary hover:underline">
                  {inv.invoiceNumber} ({money(match.invoiceAmountsMinor[i])})
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="grid gap-2 border-t bg-muted/30 px-5 py-3 text-sm">
        <ul className="grid gap-1">
          {match.signals.map((s) => (
            <li key={s.code} className="flex items-center gap-2">
              <Check className="size-3.5 shrink-0 text-success" />
              <span className="flex-1">{s.detail}</span>
              <span className="text-xs text-muted-foreground tabular">+{s.points}</span>
            </li>
          ))}
          {match.blocks.map((b) => (
            <li key={b} className="flex items-center gap-2 text-danger">
              <AlertOctagon className="size-3.5 shrink-0" />
              {BLOCK_TEXT[b] ?? humanize(b)}
            </li>
          ))}
        </ul>
        {match.partial && <Badge tone="warning" className="w-fit">Partial payment: invoice stays partly open</Badge>}
      </div>

      {pending && canApprove && (
        <div className="flex flex-col gap-2 border-t px-5 py-3 sm:flex-row sm:items-center sm:justify-end">
          {rejecting ? (
            <>
              <Input
                autoFocus
                placeholder="Why is this wrong?"
                aria-label="Rejection reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="sm:max-w-xs"
              />
              <Button variant="ghost" onClick={() => setRejecting(false)}>
                Cancel
              </Button>
              <Button variant="danger" disabled={reason.trim().length < 3} loading={decide.isPending} onClick={() => decide.mutate(false)}>
                Reject
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={() => setRejecting(true)}>
                <X /> Reject
              </Button>
              <Button loading={decide.isPending} onClick={() => decide.mutate(true)}>
                <Check /> Approve match
              </Button>
            </>
          )}
        </div>
      )}
    </Card>
  );
}
