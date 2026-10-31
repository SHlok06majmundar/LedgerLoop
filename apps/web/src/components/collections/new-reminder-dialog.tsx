'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';
import { CustomerSelect } from '@/components/customers/customer-select';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { Field, Input, Textarea } from '@/components/ui/input';
import { api, apiPage } from '@/lib/api';
import { applyApiError } from '@/lib/auth';
import { date, money } from '@/lib/format';
import { useOrgQueryKey } from '@/lib/hooks';
import { useSession } from '@/lib/session';
import type { Invoice } from '@/lib/types';

export function NewReminderDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const queryClient = useQueryClient();
  const organizationId = useSession((s) => s.organizationId);
  const [customerId, setCustomerId] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [message, setMessage] = useState('');
  const [scheduledAt, setScheduledAt] = useState('');

  const invoices = useQuery({
    queryKey: useOrgQueryKey('customers', customerId, 'invoices', 'open'),
    queryFn: () =>
      apiPage<Invoice>(`/customers/${customerId}/invoices`, { query: { status: 'OPEN', limit: 100, sort: 'dueDate', order: 'asc' } }),
    enabled: Boolean(customerId),
  });

  const send = useMutation({
    mutationFn: () =>
      api('/collections/reminders', {
        method: 'POST',
        body: {
          invoiceIds: selected,
          message: message || undefined,
          scheduledAt: scheduledAt ? new Date(scheduledAt).toISOString() : undefined,
        },
      }),
    onSuccess: () => {
      toast.success(scheduledAt ? 'Reminder scheduled' : 'Reminder is being sent');
      onOpenChange(false);
      setSelected([]);
      setMessage('');
      void queryClient.invalidateQueries({ queryKey: [organizationId, 'reminders'] });
    },
    onError: (e) => applyApiError(e),
  });

  const toggle = (id: string) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Send a reminder" description="The open invoice PDFs are attached." className="max-w-2xl">
        <Field label="Customer" htmlFor="rem-customer">
          <CustomerSelect
            id="rem-customer"
            value={customerId}
            onChange={(c) => {
              setCustomerId(c?.id ?? '');
              setSelected([]);
            }}
          />
        </Field>
        {customerId && (
          <fieldset className="grid gap-2">
            <legend className="mb-1 text-sm font-medium">Invoices</legend>
            {invoices.data?.items.length ? (
              invoices.data.items.map((inv) => (
                <label key={inv.id} className="flex items-center gap-3 rounded-lg border px-3 py-2 text-sm">
                  <input type="checkbox" checked={selected.includes(inv.id)} onChange={() => toggle(inv.id)} className="size-4 accent-[var(--primary)]" />
                  <span className="font-medium">{inv.invoiceNumber}</span>
                  <span className="text-muted-foreground">due {date(inv.dueDate)}</span>
                  <span className="ml-auto tabular">{money(inv.outstandingMinor)}</span>
                </label>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">This customer has no open invoices.</p>
            )}
          </fieldset>
        )}
        <Field label="Personal note (optional)" htmlFor="rem-message">
          <Textarea id="rem-message" rows={3} value={message} onChange={(e) => setMessage(e.target.value)} />
        </Field>
        <Field label="Send later (optional)" htmlFor="rem-when" hint="Leave empty to send now.">
          <Input id="rem-when" type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} />
        </Field>
        <DialogFooter>
          <Button disabled={selected.length === 0} loading={send.isPending} onClick={() => send.mutate()}>
            {scheduledAt ? 'Schedule reminder' : 'Send reminder'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
