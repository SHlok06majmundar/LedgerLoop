import { createCustomerSchema } from '@ledgerloop/validation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Button, Input, Label, Loading, Screen } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { notify } from '@/lib/notify';
import { useSession } from '@/lib/session';
import type { Customer } from '@/lib/types';

interface Values {
  name: string;
  email: string;
  phone: string;
  gstin: string;
  paymentTermsDays: string;
  notes: string;
}

const EMPTY: Values = { name: '', email: '', phone: '', gstin: '', paymentTermsDays: '30', notes: '' };

/** Add a customer, or edit one when opened with `?id=`. */
export default function CustomerFormScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const queryClient = useQueryClient();
  const organizationId = useSession((s) => s.organizationId);
  const [values, setValues] = useState<Values>(EMPTY);
  const [errors, setErrors] = useState<Partial<Record<keyof Values, string>>>({});

  const existing = useQuery({
    queryKey: [organizationId, 'customers', id],
    queryFn: () => api<Customer>(`/customers/${id}`),
    enabled: Boolean(id),
  });
  useEffect(() => {
    const c = existing.data;
    if (!c) return;
    setValues({
      name: c.name,
      email: c.email ?? '',
      phone: c.phone ?? '',
      gstin: c.gstin ?? '',
      paymentTermsDays: String(c.paymentTermsDays),
      notes: c.notes ?? '',
    });
  }, [existing.data]);

  const set = (key: keyof Values) => (text: string) => {
    setValues((v) => ({ ...v, [key]: text }));
    setErrors((e) => ({ ...e, [key]: undefined }));
  };

  const save = useMutation({
    mutationFn: (body: object) =>
      id
        ? api<Customer>(`/customers/${id}`, { method: 'PATCH', body })
        : api<Customer>('/customers', { method: 'POST', body }),
    onSuccess: (saved) => {
      void queryClient.invalidateQueries({ queryKey: [organizationId, 'customers'] });
      notify(id ? 'Customer updated' : 'Customer added', saved.name);
      if (id) router.back();
      else router.replace(`/customer/${saved.id}`);
    },
    onError: (e) => notify('Could not save customer', e instanceof ApiError ? e.message : 'Try again'),
  });

  const submit = () => {
    const parsed = createCustomerSchema.safeParse({
      ...values,
      paymentTermsDays: values.paymentTermsDays.trim() === '' ? undefined : Number(values.paymentTermsDays),
    });
    if (!parsed.success) {
      const next: typeof errors = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0] as keyof Values;
        next[key] ??= key === 'paymentTermsDays' ? 'Enter 0 to 365 days' : issue.message;
      }
      setErrors(next);
      return;
    }
    // Send cleared optional fields as empty strings so an edit can remove them.
    save.mutate({
      ...parsed.data,
      email: values.email.trim(),
      phone: values.phone.trim(),
      gstin: values.gstin.trim(),
      notes: values.notes.trim(),
    });
  };

  if (id && existing.isPending) return <Loading />;

  return (
    <Screen>
      <Stack.Screen options={{ title: id ? 'Edit customer' : 'Add customer' }} />
      <Input label="Customer name" value={values.name} onChangeText={set('name')} error={errors.name} autoFocus={!id} />
      <Input
        label="Email"
        value={values.email}
        onChangeText={set('email')}
        error={errors.email}
        keyboardType="email-address"
        autoCapitalize="none"
        autoComplete="email"
      />
      <Label>Invoices and payment reminders are emailed here.</Label>
      <Input label="Phone" value={values.phone} onChangeText={set('phone')} error={errors.phone} keyboardType="phone-pad" />
      <Input
        label="GSTIN"
        value={values.gstin}
        onChangeText={set('gstin')}
        error={errors.gstin}
        autoCapitalize="characters"
        placeholder="27AAPFU0939F1ZV"
      />
      <Input
        label="Payment terms (days)"
        value={values.paymentTermsDays}
        onChangeText={set('paymentTermsDays')}
        error={errors.paymentTermsDays}
        keyboardType="number-pad"
      />
      <Input label="Notes" value={values.notes} onChangeText={set('notes')} error={errors.notes} multiline />
      <Button title={id ? 'Save changes' : 'Add customer'} onPress={submit} loading={save.isPending} />
    </Screen>
  );
}
