import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import { Alert, View } from 'react-native';
import { Amount, Body, Button, Card, Chips, Input, Label, Row, Screen } from '@/components/ui';
import { api, ApiError, apiPage, newIdempotencyKey } from '@/lib/api';
import { date, money, parseMoneyInput, todayISO } from '@/lib/format';
import { useSession } from '@/lib/session';
import type { Customer, Invoice } from '@/lib/types';

const METHODS = [
  { value: 'UPI', label: 'UPI' },
  { value: 'NEFT', label: 'NEFT' },
  { value: 'IMPS', label: 'IMPS' },
  { value: 'RTGS', label: 'RTGS' },
  { value: 'CHEQUE', label: 'Cheque' },
  { value: 'CASH', label: 'Cash' },
];

/** Applies the amount to open invoices, oldest due first. */
function oldestFirst(invoices: Invoice[], amountMinor: number) {
  let left = amountMinor;
  const lines: { invoiceId: string; amountMinor: number }[] = [];
  for (const inv of invoices) {
    if (left <= 0) break;
    const take = Math.min(left, inv.outstandingMinor);
    lines.push({ invoiceId: inv.id, amountMinor: take });
    left -= take;
  }
  return lines;
}

export default function NewPaymentScreen() {
  const params = useLocalSearchParams<{ customerId?: string }>();
  const queryClient = useQueryClient();
  const organizationId = useSession((s) => s.organizationId);
  const [customerId, setCustomerId] = useState(params.customerId ?? '');
  const [search, setSearch] = useState('');
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('UPI');
  const [reference, setReference] = useState('');
  const key = useRef(newIdempotencyKey());

  const customers = useQuery({
    queryKey: [organizationId, 'customers', 'pick', search],
    queryFn: () => apiPage<Customer>('/customers', { query: { search, limit: 20, sort: 'name', order: 'asc' } }),
    enabled: !customerId,
  });
  const customer = useQuery({
    queryKey: [organizationId, 'customers', customerId],
    queryFn: () => api<Customer>(`/customers/${customerId}`),
    enabled: Boolean(customerId),
  });
  const open = useQuery({
    queryKey: [organizationId, 'customers', customerId, 'invoices', 'open'],
    queryFn: () => apiPage<Invoice>(`/customers/${customerId}/invoices`, { query: { status: 'OPEN', limit: 100, sort: 'dueDate', order: 'asc' } }),
    enabled: Boolean(customerId),
  });

  const amountMinor = parseMoneyInput(amount);
  const lines = amountMinor ? oldestFirst(open.data?.items ?? [], amountMinor) : [];

  const save = useMutation({
    mutationFn: () =>
      api<{ paymentNumber: string }>('/payments', {
        method: 'POST',
        idempotencyKey: key.current,
        body: {
          customerId,
          amountMinor,
          method,
          reference: reference.trim() || undefined,
          paymentDate: todayISO(),
          allocations: lines.length ? lines : undefined,
        },
      }),
    onSuccess: (p) => {
      void queryClient.invalidateQueries({ queryKey: [organizationId] });
      Alert.alert('Payment recorded', `${p.paymentNumber} saved and applied to invoices.`);
      router.back();
    },
    onError: (e) => {
      key.current = newIdempotencyKey();
      Alert.alert('Could not record payment', e instanceof ApiError ? e.message : 'Try again');
    },
  });

  if (!customerId) {
    return (
      <Screen>
        <Input label="Find customer" value={search} onChangeText={setSearch} placeholder="Name, email or phone" />
        <Card style={{ paddingVertical: 4 }}>
          {(customers.data?.items ?? []).map((c) => (
            <Row key={c.id} title={c.name} subtitle={c.email} onPress={() => setCustomerId(c.id)} />
          ))}
        </Card>
      </Screen>
    );
  }

  return (
    <Screen>
      <Row title={customer.data?.name ?? '…'} subtitle="Change customer" onPress={() => setCustomerId('')} />
      <Input label="Amount received (₹)" value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder="0.00" error={amount && !amountMinor ? 'Enter an amount like 2500 or 2500.50' : undefined} />
      <Label>Method</Label>
      <Chips value={method} options={METHODS} onChange={setMethod} />
      <Input label="Reference (UTR / cheque no.)" value={reference} onChangeText={setReference} autoCapitalize="characters" />
      <Card style={{ gap: 8 }}>
        <Body bold>Applied oldest first</Body>
        {lines.length === 0 ? (
          <Label>{open.data?.items.length ? 'Enter an amount to see how it is applied.' : 'No open invoices: kept as unallocated credit.'}</Label>
        ) : (
          lines.map((l) => {
            const inv = open.data!.items.find((i) => i.id === l.invoiceId)!;
            return (
              <View key={l.invoiceId} style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Label>{inv.invoiceNumber} · due {date(inv.dueDate)}</Label>
                <Amount size={14}>{money(l.amountMinor)}</Amount>
              </View>
            );
          })
        )}
      </Card>
      <Button title="Record payment" onPress={() => save.mutate()} loading={save.isPending} disabled={!amountMinor} />
    </Screen>
  );
}
