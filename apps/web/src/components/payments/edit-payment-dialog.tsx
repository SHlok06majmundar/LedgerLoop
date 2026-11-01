'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { Field, Input, NativeSelect, Textarea } from '@/components/ui/input';
import { api } from '@/lib/api';
import { applyApiError } from '@/lib/auth';
import { useSession } from '@/lib/session';
import type { Payment } from '@/lib/types';
import { PAYMENT_METHODS } from './payment-methods';

/**
 * Corrects how a payment is described. The amount and customer are money and
 * only change by reversing the payment and recording it again.
 */
export function EditPaymentDialog({
  payment,
  open,
  onOpenChange,
}: {
  payment: Payment;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const organizationId = useSession((s) => s.organizationId);
  const [form, setForm] = useState({
    method: payment.method,
    reference: payment.reference ?? '',
    paymentDate: payment.paymentDate.slice(0, 10),
    notes: payment.notes ?? '',
  });
  const fromBank = Boolean(payment.bankTransactionId);

  const save = useMutation({
    mutationFn: () =>
      api(`/payments/${payment.id}`, {
        method: 'PATCH',
        body: {
          method: form.method,
          reference: form.reference.trim() || undefined,
          paymentDate: fromBank ? undefined : form.paymentDate,
          notes: form.notes,
        },
      }),
    onSuccess: () => {
      toast.success('Payment updated');
      void queryClient.invalidateQueries({ queryKey: [organizationId] });
      onOpenChange(false);
    },
    onError: (e) => applyApiError(e),
  });
  const set = (key: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title={`Edit ${payment.paymentNumber}`}
        description="Fix how this payment is described. To change the amount or customer, reverse it and record it again."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Method" htmlFor="edit-method">
            <NativeSelect id="edit-method" value={form.method} onChange={set('method')}>
              {PAYMENT_METHODS.map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field
            label="Payment date"
            htmlFor="edit-date"
            hint={fromBank ? 'Set by the bank statement' : undefined}
          >
            <Input id="edit-date" type="date" value={form.paymentDate} disabled={fromBank} onChange={set('paymentDate')} />
          </Field>
          <Field label="Reference (UTR / cheque no.)" htmlFor="edit-reference" className="sm:col-span-2">
            <Input id="edit-reference" value={form.reference} onChange={set('reference')} />
          </Field>
          <Field label="Notes" htmlFor="edit-notes" className="sm:col-span-2">
            <Textarea id="edit-notes" rows={3} value={form.notes} onChange={set('notes')} />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button loading={save.isPending} onClick={() => save.mutate()}>
            Save changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
