'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { createCustomerSchema } from '@ledgerloop/validation';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { DialogFooter } from '@/components/ui/dialog';
import { Field, Input, Textarea } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { api } from '@/lib/api';
import { applyApiError } from '@/lib/auth';
import { minorToInput, parseMoneyInput } from '@/lib/format';
import { useSession } from '@/lib/session';
import type { Customer } from '@/lib/types';

const formSchema = createCustomerSchema.extend({
  creditLimit: z
    .string()
    .optional()
    .refine((v) => !v || parseMoneyInput(v) !== null, 'Enter an amount like 50000 or 50000.50'),
});
type FormValues = z.input<typeof formSchema>;

/** Create or edit a customer; `customer` switches it to edit mode. */
export function CustomerForm({ customer, onDone }: { customer?: Customer; onDone: (c: Customer) => void }) {
  const queryClient = useQueryClient();
  const organizationId = useSession((s) => s.organizationId);
  const {
    register,
    handleSubmit,
    setError,
    setValue,
    watch,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: customer?.name ?? '',
      email: customer?.email ?? '',
      phone: customer?.phone ?? '',
      gstin: customer?.gstin ?? '',
      paymentTermsDays: customer?.paymentTermsDays ?? 30,
      notes: customer?.notes ?? '',
      remindersEnabled: customer?.remindersEnabled ?? true,
      billingAddress: customer?.billingAddress,
      creditLimit: customer?.creditLimitMinor !== undefined ? minorToInput(customer.creditLimitMinor) : '',
    },
  });

  const save = useMutation({
    mutationFn: ({ creditLimit, ...values }: FormValues) => {
      const creditLimitMinor = creditLimit ? parseMoneyInput(creditLimit) : undefined;
      const body = { ...values, creditLimitMinor: creditLimitMinor ?? undefined };
      return customer
        ? api<Customer>(`/customers/${customer.id}`, { method: 'PATCH', body })
        : api<Customer>('/customers', { method: 'POST', body });
    },
    onSuccess: (saved) => {
      void queryClient.invalidateQueries({ queryKey: [organizationId, 'customers'] });
      toast.success(customer ? 'Customer updated' : 'Customer added');
      onDone(saved);
    },
    onError: (error) => applyApiError(error, setError),
  });

  return (
    <form onSubmit={handleSubmit((v) => save.mutate(v))} className="grid gap-4" noValidate>
      <Field label="Customer name" htmlFor="c-name" error={errors.name?.message}>
        <Input id="c-name" autoFocus {...register('name')} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Email" htmlFor="c-email" error={errors.email?.message} hint="Invoices and reminders go here.">
          <Input id="c-email" type="email" {...register('email')} />
        </Field>
        <Field label="Phone" htmlFor="c-phone" error={errors.phone?.message}>
          <Input id="c-phone" type="tel" {...register('phone')} />
        </Field>
        <Field label="GSTIN" htmlFor="c-gstin" error={errors.gstin?.message} hint="Optional">
          <Input id="c-gstin" className="uppercase" maxLength={15} {...register('gstin')} />
        </Field>
        <Field label="Payment terms (days)" htmlFor="c-terms" error={errors.paymentTermsDays?.message}>
          <Input id="c-terms" type="number" min={0} max={365} {...register('paymentTermsDays', { valueAsNumber: true })} />
        </Field>
        <Field label="Credit limit (₹)" htmlFor="c-limit" error={errors.creditLimit?.message} hint="Leave empty for no limit">
          <Input id="c-limit" inputMode="decimal" {...register('creditLimit')} />
        </Field>
      </div>
      <fieldset className="grid gap-3 rounded-lg border p-4">
        <legend className="px-1 text-sm font-medium">Billing address</legend>
        <Input placeholder="Address line 1" aria-label="Address line 1" {...register('billingAddress.line1')} />
        <Input placeholder="Address line 2" aria-label="Address line 2" {...register('billingAddress.line2')} />
        <div className="grid gap-3 sm:grid-cols-3">
          <Input placeholder="City" aria-label="City" {...register('billingAddress.city')} />
          <Input placeholder="State" aria-label="State" {...register('billingAddress.state')} />
          <Input placeholder="PIN code" aria-label="PIN code" {...register('billingAddress.postalCode')} />
        </div>
      </fieldset>
      <Field label="Notes" htmlFor="c-notes">
        <Textarea id="c-notes" rows={2} {...register('notes')} />
      </Field>
      <label className="flex items-center justify-between gap-4 rounded-lg border p-3 text-sm">
        <span>
          <span className="font-medium">Send automated reminders</span>
          <span className="block text-xs text-muted-foreground">Respect this customer&apos;s communication preference.</span>
        </span>
        <Switch
          checked={watch('remindersEnabled') ?? true}
          onCheckedChange={(v) => setValue('remindersEnabled', v)}
        />
      </label>
      <DialogFooter>
        <Button type="submit" loading={save.isPending}>
          {customer ? 'Save changes' : 'Add customer'}
        </Button>
      </DialogFooter>
    </form>
  );
}
