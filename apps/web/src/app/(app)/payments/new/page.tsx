'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useRef, useState } from 'react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/app/page-header';
import { CustomerSelect } from '@/components/customers/customer-select';
import { AllocationEditor, allocationLines, type AllocationDraft } from '@/components/payments/allocation-editor';
import { PAYMENT_METHODS } from '@/components/payments/payment-methods';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, Input, NativeSelect, Textarea } from '@/components/ui/input';
import { api, newIdempotencyKey } from '@/lib/api';
import { applyApiError } from '@/lib/auth';
import { parseMoneyInput, todayISO } from '@/lib/format';
import { useSession } from '@/lib/session';
import type { Payment } from '@/lib/types';

function RecordPayment() {
  const params = useSearchParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const organizationId = useSession((s) => s.organizationId);
  const [customerId, setCustomerId] = useState(params.get('customerId') ?? '');
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('NEFT');
  const [reference, setReference] = useState('');
  const [paymentDate, setPaymentDate] = useState(todayISO());
  const [notes, setNotes] = useState('');
  const [draft, setDraft] = useState<AllocationDraft>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  // One key per form submission attempt: retries after a network blip are safe.
  const idempotencyKey = useRef(newIdempotencyKey());

  const amountMinor = parseMoneyInput(amount);
  const lines = allocationLines(draft);

  const save = useMutation({
    mutationFn: () =>
      api<Payment>('/payments', {
        method: 'POST',
        idempotencyKey: idempotencyKey.current,
        body: {
          customerId,
          amountMinor,
          method,
          reference: reference || undefined,
          paymentDate,
          notes: notes || undefined,
          allocations: lines?.length ? lines : undefined,
        },
      }),
    onSuccess: (payment) => {
      void queryClient.invalidateQueries({ queryKey: [organizationId] });
      toast.success(`${payment.paymentNumber} recorded`);
      router.push(`/payments/${payment.id}`);
    },
    onError: (error) => {
      idempotencyKey.current = newIdempotencyKey();
      applyApiError(error);
    },
  });

  const submit = () => {
    const problems: Record<string, string> = {};
    if (!customerId) problems.customerId = 'Choose a customer';
    if (!amountMinor) problems.amount = 'Enter the amount received, e.g. 25000 or 25000.50';
    if (!lines) problems.allocations = 'Fix the invalid allocation amounts';
    else if (amountMinor && lines.reduce((s, l) => s + l.amountMinor, 0) > amountMinor) {
      problems.allocations = 'Allocations exceed the payment amount';
    }
    setErrors(problems);
    if (Object.keys(problems).length === 0) save.mutate();
  };

  return (
    <>
      <PageHeader back={{ href: '/payments', label: 'Payments' }} title="Record payment" />
      <div className="grid gap-6 lg:grid-cols-[1fr_1.2fr]">
        <Card>
          <CardHeader>
            <CardTitle>Payment details</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            <Field label="Customer" htmlFor="customer" error={errors.customerId}>
              <CustomerSelect
                id="customer"
                value={customerId}
                invalid={!!errors.customerId}
                onChange={(c) => {
                  setCustomerId(c?.id ?? '');
                  setDraft({});
                }}
              />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Amount received (₹)" htmlFor="amount" error={errors.amount}>
                <Input id="amount" inputMode="decimal" placeholder="0.00" value={amount} onChange={(e) => setAmount(e.target.value)} />
              </Field>
              <Field label="Payment date" htmlFor="date">
                <Input id="date" type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} />
              </Field>
              <Field label="Method" htmlFor="method">
                <NativeSelect id="method" value={method} onChange={(e) => setMethod(e.target.value)}>
                  {PAYMENT_METHODS.map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
              <Field label="Reference" htmlFor="reference" hint="UTR or cheque number. Used to catch duplicates.">
                <Input id="reference" className="uppercase" value={reference} onChange={(e) => setReference(e.target.value)} />
              </Field>
            </div>
            <Field label="Notes" htmlFor="notes">
              <Textarea id="notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </Field>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Apply to invoices</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            <AllocationEditor customerId={customerId} availableMinor={amountMinor ?? 0} draft={draft} onChange={setDraft} />
            {errors.allocations && <p className="text-xs text-danger">{errors.allocations}</p>}
            <Button onClick={submit} loading={save.isPending} className="justify-self-end">
              Record payment
            </Button>
          </CardContent>
        </Card>
      </div>
    </>
  );
}

export default function NewPaymentPage() {
  return (
    <Suspense>
      <RecordPayment />
    </Suspense>
  );
}
