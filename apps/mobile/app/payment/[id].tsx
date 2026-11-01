import { Permission } from '@ledgerloop/shared-types';
import { updatePaymentSchema } from '@ledgerloop/validation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import { View } from 'react-native';
import { ReasonForm } from '@/components/reason-form';
import { Amount, Body, Button, Card, Chips, Input, Label, Loading, Row, Screen, StatusPill, Title } from '@/components/ui';
import { api, ApiError, newIdempotencyKey } from '@/lib/api';
import { date, humanize, money } from '@/lib/format';
import { notify } from '@/lib/notify';
import { useCan } from '@/lib/permissions';
import { useSession } from '@/lib/session';
import { refId, refName, type Payment, type PaymentAllocation } from '@/lib/types';
import { useTheme } from '@/theme';

const METHODS = [
  { value: 'UPI', label: 'UPI' },
  { value: 'NEFT', label: 'NEFT' },
  { value: 'IMPS', label: 'IMPS' },
  { value: 'RTGS', label: 'RTGS' },
  { value: 'BANK_TRANSFER', label: 'Bank transfer' },
  { value: 'CHEQUE', label: 'Cheque' },
  { value: 'CASH', label: 'Cash' },
];

type Detailed = Payment & { allocations: PaymentAllocation[] };

export default function PaymentScreen() {
  const t = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const queryClient = useQueryClient();
  const organizationId = useSession((s) => s.organizationId);
  const canEdit = useCan(Permission.PAYMENTS_WRITE);
  const canReverse = useCan(Permission.PAYMENTS_REVERSE);
  const [mode, setMode] = useState<'view' | 'edit' | 'reverse'>('view');
  const reverseKey = useRef(newIdempotencyKey());
  const payment = useQuery({ queryKey: [organizationId, 'payments', id], queryFn: () => api<Detailed>(`/payments/${id}`) });

  /** A payment moves invoice balances, customer totals and the dashboard. */
  const refresh = () => void queryClient.invalidateQueries({ queryKey: [organizationId] });
  const failed = (title: string) => (e: Error) => notify(title, e instanceof ApiError ? e.message : 'Try again');

  const reverse = useMutation({
    mutationFn: (reason: string) =>
      api(`/payments/${id}/reversals`, { method: 'POST', body: { reason }, idempotencyKey: reverseKey.current }),
    onSuccess: () => {
      setMode('view');
      refresh();
      notify('Payment reversed', 'Its amounts were taken off the invoices, which are open again.');
    },
    onError: (e) => {
      reverseKey.current = newIdempotencyKey();
      failed('Could not reverse payment')(e);
    },
  });

  if (payment.isPending) return <Loading />;
  if (payment.isError) return <Screen><Body>{payment.error.message}</Body></Screen>;
  const p = payment.data;
  const reversed = p.status === 'REVERSED';
  const active = p.allocations.filter((a) => a.status === 'ACTIVE');

  return (
    <Screen refreshing={payment.isFetching} onRefresh={() => void payment.refetch()}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Title>{p.paymentNumber}</Title>
        <StatusPill status={p.status} />
      </View>
      <Row title={refName(p.customerId)} subtitle="Customer" onPress={() => router.push(`/customer/${refId(p.customerId)}`)} />
      {reversed && (
        <Card style={{ backgroundColor: t.dangerSoft }}>
          <Body color={t.danger} bold>Reversed {date(p.reversedAt)}</Body>
          {p.reversalReason ? <Label>{p.reversalReason}</Label> : null}
        </Card>
      )}
      <Card style={{ gap: 4 }}>
        <Label>Amount received</Label>
        <Amount size={28}>{money(p.amountMinor)}</Amount>
        {!reversed && <Label>{money(p.allocatedMinor)} applied · {money(p.amountMinor - p.allocatedMinor)} unapplied credit</Label>}
      </Card>

      {mode === 'edit' ? (
        <EditDetails payment={p} onDone={() => setMode('view')} onSaved={refresh} />
      ) : (
        <Card style={{ gap: 8 }}>
          <Detail label="Method" value={humanize(p.method)} />
          <Detail label="Reference" value={p.reference || '—'} />
          <Detail label="Payment date" value={date(p.paymentDate)} />
          {p.bankTransactionId ? <Label>Matched from a bank statement line.</Label> : null}
          {p.notes ? <Detail label="Notes" value={p.notes} /> : null}
        </Card>
      )}

      <Body bold>Applied to invoices</Body>
      <Card style={{ paddingVertical: 4 }}>
        {p.allocations.length === 0 ? (
          <Label>Not applied to any invoice.</Label>
        ) : (
          p.allocations.map((a) => (
            <Row
              key={a.id}
              title={typeof a.invoiceId === 'object' ? a.invoiceId.invoiceNumber : 'Invoice'}
              subtitle={a.status === 'ACTIVE' ? 'Applied' : 'Reversed'}
              onPress={() => router.push(`/invoice/${typeof a.invoiceId === 'object' ? a.invoiceId.id : a.invoiceId}`)}
              right={<Amount color={a.status === 'ACTIVE' ? undefined : t.muted}>{money(a.amountMinor)}</Amount>}
            />
          ))
        )}
      </Card>

      {!reversed && mode === 'view' && (
        <View style={{ gap: 12, marginTop: 4 }}>
          {canEdit && <Button title="Edit details" variant="outline" icon="create-outline" onPress={() => setMode('edit')} />}
          {canReverse && <Button title="Reverse payment" variant="danger" icon="arrow-undo-outline" onPress={() => setMode('reverse')} />}
          <Label>The amount and customer cannot be edited. If they are wrong, reverse this payment and record it again.</Label>
        </View>
      )}
      {mode === 'reverse' && (
        <ReasonForm
          title="Reverse this payment"
          hint={
            active.length
              ? `This takes ${money(p.allocatedMinor)} off ${active.length} invoice${active.length > 1 ? 's' : ''}, which become unpaid again. Use it for a bounced cheque or a payment recorded by mistake. It stays on record and cannot be undone.`
              : 'The payment stays on record marked reversed and no longer counts as received. This cannot be undone.'
          }
          action="Reverse"
          loading={reverse.isPending}
          onSubmit={(reason) => reverse.mutate(reason)}
          onCancel={() => setMode('view')}
        />
      )}
    </Screen>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
      <Label>{label}</Label>
      <View style={{ flex: 1, alignItems: 'flex-end' }}>
        <Body>{value}</Body>
      </View>
    </View>
  );
}

function EditDetails({ payment, onDone, onSaved }: { payment: Payment; onDone: () => void; onSaved: () => void }) {
  const [method, setMethod] = useState(payment.method);
  const [reference, setReference] = useState(payment.reference ?? '');
  const [paymentDate, setPaymentDate] = useState(payment.paymentDate);
  const [notes, setNotes] = useState(payment.notes ?? '');
  const [error, setError] = useState<string>();
  const fromBank = Boolean(payment.bankTransactionId);

  const save = useMutation({
    mutationFn: (body: object) => api<Payment>(`/payments/${payment.id}`, { method: 'PATCH', body }),
    onSuccess: () => {
      onSaved();
      onDone();
      notify('Payment updated');
    },
    onError: (e) => notify('Could not update payment', e instanceof ApiError ? e.message : 'Try again'),
  });

  const submit = () => {
    // Send only what changed; the API refuses amount and customer edits.
    const changes: Record<string, string> = {};
    if (method !== payment.method) changes.method = method;
    if (reference.trim() !== (payment.reference ?? '')) changes.reference = reference.trim();
    if (!fromBank && paymentDate !== payment.paymentDate) changes.paymentDate = paymentDate.trim();
    if (notes.trim() !== (payment.notes ?? '')) changes.notes = notes.trim();
    if (Object.keys(changes).length === 0) return onDone();
    const parsed = updatePaymentSchema.safeParse(changes);
    if (!parsed.success) return setError(parsed.error.issues[0]?.message ?? 'Check the values');
    setError(undefined);
    save.mutate(changes);
  };

  return (
    <Card style={{ gap: 12 }}>
      <Body bold>Edit details</Body>
      <Label>Method</Label>
      <Chips value={method} options={METHODS} onChange={setMethod} />
      <Input label="Reference (UTR / cheque no.)" value={reference} onChangeText={setReference} autoCapitalize="characters" />
      <Input
        label="Payment date (YYYY-MM-DD)"
        value={paymentDate}
        onChangeText={setPaymentDate}
        editable={!fromBank}
        error={error}
        keyboardType="numbers-and-punctuation"
      />
      {fromBank ? <Label>The date comes from the bank statement and cannot be changed.</Label> : null}
      <Input label="Notes" value={notes} onChangeText={setNotes} multiline />
      <View style={{ flexDirection: 'row', gap: 12 }}>
        <View style={{ flex: 1 }}>
          <Button title="Cancel" variant="outline" onPress={onDone} disabled={save.isPending} />
        </View>
        <View style={{ flex: 1 }}>
          <Button title="Save" onPress={submit} loading={save.isPending} />
        </View>
      </View>
    </Card>
  );
}
