'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';
import { CustomerSelect } from '@/components/customers/customer-select';
import { AllocationEditor, allocationLines, type AllocationDraft } from '@/components/payments/allocation-editor';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { FilterTabs } from '@/components/app/list';
import { Field, Input, NativeSelect } from '@/components/ui/input';
import { api, apiPage } from '@/lib/api';
import { applyApiError } from '@/lib/auth';
import { date, money } from '@/lib/format';
import { useOrgQueryKey } from '@/lib/hooks';
import { useSession } from '@/lib/session';
import type { BankTransaction, Payment } from '@/lib/types';

/** Lets a person match a bank credit to invoices or to an already-recorded payment. */
export function ManualMatchDialog({
  txn,
  open,
  onOpenChange,
}: {
  txn: BankTransaction;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const organizationId = useSession((s) => s.organizationId);
  const [mode, setMode] = useState<'invoices' | 'payment'>('invoices');
  const [customerId, setCustomerId] = useState('');
  const [draft, setDraft] = useState<AllocationDraft>({});
  const [paymentId, setPaymentId] = useState('');
  const [note, setNote] = useState('');

  const payments = useQuery({
    queryKey: useOrgQueryKey('payments', 'unreconciled', customerId),
    queryFn: () => apiPage<Payment>(`/customers/${customerId}/payments`, { query: { status: 'POSTED', limit: 50 } }),
    enabled: mode === 'payment' && Boolean(customerId),
  });
  const candidates = (payments.data?.items ?? []).filter((p) => !p.bankTransactionId);
  const chosen = candidates.find((p) => p.id === paymentId);
  const lines = allocationLines(draft);

  const save = useMutation({
    mutationFn: () =>
      api(`/reconciliation/transactions/${txn.id}/manual-match`, {
        method: 'POST',
        body:
          mode === 'payment'
            ? { paymentId, acceptDiscrepancy: chosen?.amountMinor !== txn.amountMinor, note: note || undefined }
            : { customerId, allocations: lines ?? [], note: note || undefined },
      }),
    onSuccess: () => {
      toast.success('Bank credit matched');
      onOpenChange(false);
      void queryClient.invalidateQueries({ queryKey: [organizationId] });
    },
    onError: (e) => applyApiError(e),
  });

  const allocated = lines?.reduce((s, l) => s + l.amountMinor, 0) ?? 0;
  const valid =
    customerId &&
    (mode === 'payment' ? Boolean(paymentId) : lines !== null && allocated <= txn.amountMinor);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title={`Match ${money(txn.amountMinor)} from ${date(txn.transactionDate)}`}
        description={txn.description}
        className="max-w-3xl"
      >
        <FilterTabs
          value={mode}
          onChange={setMode}
          options={[
            { value: 'invoices', label: 'Pay invoices' },
            { value: 'payment', label: 'Link recorded payment' },
          ]}
        />
        <Field label="Customer" htmlFor="mm-customer">
          <CustomerSelect id="mm-customer" value={customerId} onChange={(c) => setCustomerId(c?.id ?? '')} />
        </Field>
        {mode === 'invoices' ? (
          <>
            <AllocationEditor customerId={customerId} availableMinor={txn.amountMinor} draft={draft} onChange={setDraft} />
            {customerId && allocated < txn.amountMinor && (
              <p className="text-xs text-muted-foreground">
                {money(txn.amountMinor - allocated)} will stay on the payment as unallocated credit.
              </p>
            )}
          </>
        ) : (
          <Field label="Payment" htmlFor="mm-payment" hint="Only payments not yet matched to a bank line are listed.">
            <NativeSelect id="mm-payment" value={paymentId} onChange={(e) => setPaymentId(e.target.value)}>
              <option value="">Select a payment…</option>
              {candidates.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.paymentNumber} · {money(p.amountMinor)} · {date(p.paymentDate)} {p.reference ? `· ${p.reference}` : ''}
                </option>
              ))}
            </NativeSelect>
          </Field>
        )}
        {chosen && chosen.amountMinor !== txn.amountMinor && (
          <p className="rounded-lg bg-warning-soft p-3 text-sm text-warning">
            The payment ({money(chosen.amountMinor)}) differs from the bank credit ({money(txn.amountMinor)}). Linking
            records this discrepancy.
          </p>
        )}
        <Field label="Note (optional)" htmlFor="mm-note">
          <Input id="mm-note" value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
        <DialogFooter>
          <Button disabled={!valid} loading={save.isPending} onClick={() => save.mutate()}>
            Match transaction
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
