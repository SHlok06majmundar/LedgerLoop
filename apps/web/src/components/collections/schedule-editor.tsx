'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/feedback';
import { Input, NativeSelect } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { api } from '@/lib/api';
import { applyApiError } from '@/lib/auth';
import { useOrgQueryKey } from '@/lib/hooks';

type Kind = 'UPCOMING' | 'DUE_TODAY' | 'OVERDUE' | 'ESCALATION';
interface Rule {
  offsetDays: number;
  kind: Kind;
}
interface Settings {
  enabled: boolean;
  sendHour: number;
  rules: Rule[];
}

const KIND_LABELS: Record<Kind, string> = {
  UPCOMING: 'Payment reminder',
  DUE_TODAY: 'Due-date notice',
  OVERDUE: 'Overdue reminder',
  ESCALATION: 'Escalation',
};

const describe = (days: number) =>
  days < 0 ? `${-days} days before due` : days === 0 ? 'On the due date' : `${days} days overdue`;

export function ScheduleEditor({ canEdit }: { canEdit: boolean }) {
  const queryClient = useQueryClient();
  const key = useOrgQueryKey('collections', 'settings');
  const settings = useQuery({ queryKey: key, queryFn: () => api<Settings>('/collections/settings') });
  const [draft, setDraft] = useState<Settings | null>(null);
  useEffect(() => {
    if (settings.data) setDraft(settings.data);
  }, [settings.data]);

  const save = useMutation({
    mutationFn: (body: Settings) => api('/collections/settings', { method: 'PUT', body }),
    onSuccess: () => {
      toast.success('Reminder schedule saved');
      void queryClient.invalidateQueries({ queryKey: key });
    },
    onError: (e) => applyApiError(e),
  });

  if (!draft) return <Skeleton className="h-64" />;
  const setRule = (i: number, rule: Partial<Rule>) =>
    setDraft({ ...draft, rules: draft.rules.map((r, j) => (j === i ? { ...r, ...rule } : r)) });
  const sorted = [...draft.rules].map((r, i) => ({ r, i })).sort((a, b) => a.r.offsetDays - b.r.offsetDays);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Automated schedule</CardTitle>
        <CardDescription>
          Each step is sent once per invoice. Customers who opted out and paused invoices are skipped.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <label className="flex items-center justify-between gap-4 rounded-lg border p-3 text-sm">
          <span className="font-medium">Send automated reminders</span>
          <Switch disabled={!canEdit} checked={draft.enabled} onCheckedChange={(enabled) => setDraft({ ...draft, enabled })} />
        </label>
        <label className="flex items-center justify-between gap-4 text-sm">
          <span>Send after (local time)</span>
          <NativeSelect
            className="w-32"
            disabled={!canEdit}
            value={draft.sendHour}
            onChange={(e) => setDraft({ ...draft, sendHour: Number(e.target.value) })}
          >
            {Array.from({ length: 24 }, (_, h) => (
              <option key={h} value={h}>
                {String(h).padStart(2, '0')}:00
              </option>
            ))}
          </NativeSelect>
        </label>
        <ol className="grid gap-2">
          {sorted.map(({ r, i }) => (
            <li key={i} className="grid grid-cols-[90px_1fr_auto] items-center gap-2 rounded-lg border p-2 sm:grid-cols-[90px_1fr_1fr_auto]">
              <Input
                type="number"
                aria-label="Days relative to due date"
                disabled={!canEdit}
                value={r.offsetDays}
                onChange={(e) => setRule(i, { offsetDays: Number(e.target.value) })}
              />
              <span className="hidden text-sm text-muted-foreground sm:block">{describe(r.offsetDays)}</span>
              <NativeSelect aria-label="Reminder type" disabled={!canEdit} value={r.kind} onChange={(e) => setRule(i, { kind: e.target.value as Kind })}>
                {Object.entries(KIND_LABELS).map(([k, l]) => (
                  <option key={k} value={k}>
                    {l}
                  </option>
                ))}
              </NativeSelect>
              {canEdit && (
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Remove step"
                  onClick={() => setDraft({ ...draft, rules: draft.rules.filter((_, j) => j !== i) })}
                >
                  <Trash2 />
                </Button>
              )}
            </li>
          ))}
        </ol>
        {canEdit && (
          <div className="flex justify-between gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={draft.rules.length >= 10}
              onClick={() => setDraft({ ...draft, rules: [...draft.rules, { offsetDays: 30, kind: 'ESCALATION' }] })}
            >
              <Plus /> Add step
            </Button>
            <Button size="sm" loading={save.isPending} onClick={() => save.mutate(draft)}>
              Save schedule
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
