'use client';

import { Permission } from '@ledgerloop/shared-types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, EyeOff, Link2, MessageSquare } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { StatusBadge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { Field, Input, NativeSelect } from '@/components/ui/input';
import { api, apiPage } from '@/lib/api';
import { applyApiError } from '@/lib/auth';
import { date, money, relativeTime } from '@/lib/format';
import { useCan, useOrgQueryKey } from '@/lib/hooks';
import { useSession } from '@/lib/session';
import type { Match, Member, ReconException } from '@/lib/types';
import { cn } from '@/lib/utils';
import { ManualMatchDialog } from './manual-match-dialog';
import { MatchCard } from './match-card';

export function ExceptionRow({ exception, members }: { exception: ReconException; members: Member[] }) {
  const queryClient = useQueryClient();
  const organizationId = useSession((s) => s.organizationId);
  const canApprove = useCan(Permission.RECONCILIATION_APPROVE);
  const [open, setOpen] = useState(false);
  const [matching, setMatching] = useState(false);
  const [comment, setComment] = useState('');
  const [ignoring, setIgnoring] = useState(false);
  const [ignoreReason, setIgnoreReason] = useState('');
  const txn = exception.bankTransactionId;
  const resolved = exception.status === 'RESOLVED';

  const suggestions = useQuery({
    queryKey: useOrgQueryKey('matches', 'txn', txn.id),
    queryFn: () => apiPage<Match>('/reconciliation/matches', { query: { bankTransactionId: txn.id, limit: 5 } }),
    enabled: open,
  });
  const invalidate = () => queryClient.invalidateQueries({ queryKey: [organizationId] });
  const update = useMutation({
    mutationFn: (body: { assigneeId?: string | null; comment?: string }) =>
      api(`/reconciliation/exceptions/${exception.id}`, { method: 'PATCH', body }),
    onSuccess: () => {
      setComment('');
      void invalidate();
    },
    onError: (e) => applyApiError(e),
  });
  const ignore = useMutation({
    mutationFn: (reason: string) => api(`/reconciliation/exceptions/${exception.id}/ignore`, { method: 'POST', body: { reason } }),
    onSuccess: () => {
      toast.success('Marked as not a customer payment');
      setIgnoring(false);
      void invalidate();
    },
    onError: (e) => applyApiError(e),
  });

  const pending = (suggestions.data?.items ?? []).filter((m) => !m.decision);

  return (
    <div className="border-b last:border-0">
      <button
        className="grid w-full grid-cols-[1fr_auto] items-center gap-4 px-4 py-3 text-left hover:bg-muted/40 md:grid-cols-[110px_1fr_140px_130px_140px_24px]"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span className="hidden text-sm text-muted-foreground md:block">{date(txn.transactionDate)}</span>
        <span className="min-w-0">
          <span className="block truncate font-mono text-xs">{txn.description}</span>
          <span className="text-xs text-muted-foreground md:hidden">{date(txn.transactionDate)}</span>
        </span>
        <span className="text-right font-medium tabular">{money(txn.amountMinor)}</span>
        <span className="hidden md:block">
          <StatusBadge status={exception.reason} />
        </span>
        <span className="hidden truncate text-sm text-muted-foreground md:block">
          {exception.assigneeId?.name ?? 'Unassigned'}
        </span>
        <ChevronDown className={cn('hidden size-4 text-muted-foreground transition-transform md:block', open && 'rotate-180')} />
      </button>

      {open && (
        <div className="grid gap-4 bg-muted/20 px-4 pb-5 pt-1">
          {pending.map((m) => (
            <MatchCard key={m.id} match={m} />
          ))}

          <div className="grid gap-3 rounded-lg border bg-card p-4">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="text-muted-foreground">Open {relativeTime(exception.openedAt)}</span>
              {exception.resolutionMinutes != null && (
                <span className="text-muted-foreground">· resolved in {exception.resolutionMinutes} min</span>
              )}
              <div className="ml-auto flex flex-wrap gap-2">
                <NativeSelect
                  aria-label="Assignee"
                  className="h-8 w-44 text-xs"
                  value={exception.assigneeId?.id ?? ''}
                  disabled={resolved}
                  onChange={(e) => update.mutate({ assigneeId: e.target.value || null })}
                >
                  <option value="">Unassigned</option>
                  {members
                    .filter((m) => m.user && m.status === 'ACTIVE')
                    .map((m) => (
                      <option key={m.user!.id} value={m.user!.id}>
                        {m.user!.name}
                      </option>
                    ))}
                </NativeSelect>
                {!resolved && canApprove && (
                  <>
                    <Button size="sm" variant="outline" onClick={() => setMatching(true)}>
                      <Link2 /> Match manually
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      loading={ignore.isPending}
                      onClick={() => setIgnoring(true)}
                    >
                      <EyeOff /> Ignore
                    </Button>
                  </>
                )}
              </div>
            </div>

            {exception.comments.length > 0 && (
              <ul className="grid gap-2">
                {exception.comments.map((c, i) => (
                  <li key={i} className="rounded-md bg-muted px-3 py-2 text-sm">
                    <span className="font-medium">{typeof c.userId === 'object' ? c.userId.name : 'Member'}</span>{' '}
                    <span className="text-xs text-muted-foreground">{relativeTime(c.createdAt)}</span>
                    <p className="mt-0.5">{c.body}</p>
                  </li>
                ))}
              </ul>
            )}
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (comment.trim()) update.mutate({ comment: comment.trim() });
              }}
            >
              <Input placeholder="Add a comment for your team" aria-label="Comment" value={comment} onChange={(e) => setComment(e.target.value)} />
              <Button type="submit" size="icon" variant="outline" aria-label="Post comment" loading={update.isPending}>
                <MessageSquare />
              </Button>
            </form>
          </div>
        </div>
      )}
      {matching && <ManualMatchDialog txn={txn} open={matching} onOpenChange={setMatching} />}
      <Dialog open={ignoring} onOpenChange={setIgnoring}>
        <DialogContent title="Ignore this bank credit?" description="Use this for credits that are not customer payments, such as bank interest or refunds.">
          <Field label="Reason" htmlFor={`ignore-${exception.id}`}>
            <Input id={`ignore-${exception.id}`} autoFocus value={ignoreReason} onChange={(e) => setIgnoreReason(e.target.value)} />
          </Field>
          <DialogFooter>
            <Button disabled={ignoreReason.trim().length < 3} loading={ignore.isPending} onClick={() => ignore.mutate(ignoreReason.trim())}>
              Ignore credit
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
