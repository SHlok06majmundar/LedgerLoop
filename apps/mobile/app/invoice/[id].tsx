import { Permission } from '@ledgerloop/shared-types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { ReasonForm } from '@/components/reason-form';
import { Amount, Body, Button, Card, Label, Loading, Screen, StatusPill, Title } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { date, money } from '@/lib/format';
import { confirm, notify } from '@/lib/notify';
import { useCan } from '@/lib/permissions';
import { useSession } from '@/lib/session';
import { refId, refName, type Invoice } from '@/lib/types';
import { useTheme } from '@/theme';

const OPEN = ['ISSUED', 'PARTIALLY_PAID', 'OVERDUE'];

export default function InvoiceScreen() {
  const t = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const queryClient = useQueryClient();
  const organizationId = useSession((s) => s.organizationId);
  const canWrite = useCan(Permission.INVOICES_WRITE);
  const canIssue = useCan(Permission.INVOICES_ISSUE);
  const canVoid = useCan(Permission.INVOICES_VOID);
  const [voiding, setVoiding] = useState(false);
  const invoice = useQuery({ queryKey: [organizationId, 'invoices', id], queryFn: () => api<Invoice>(`/invoices/${id}`) });

  /** Invoices feed the lists, the dashboard, aging and customer balances. */
  const refresh = () => void queryClient.invalidateQueries({ queryKey: [organizationId] });
  const failed = (title: string) => (e: Error) => notify(title, e instanceof ApiError ? e.message : 'Try again');

  const send = useMutation({
    mutationFn: () => api(`/invoices/${id}/send`, { method: 'POST', body: {} }),
    onSuccess: () => notify('Invoice emailed', 'The PDF is on its way to the customer.'),
    onError: failed('Could not send'),
  });
  const issue = useMutation({
    mutationFn: () => api<Invoice>(`/invoices/${id}/issue`, { method: 'POST' }),
    onSuccess: (inv) => {
      refresh();
      notify('Invoice issued', `${inv.invoiceNumber} is now final and counts towards outstanding.`);
    },
    onError: failed('Could not issue invoice'),
  });
  const remove = useMutation({
    mutationFn: () => api(`/invoices/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      // Drop the deleted invoice first so the refresh does not refetch it into a 404.
      queryClient.removeQueries({ queryKey: [organizationId, 'invoices', id] });
      router.back();
      refresh();
      notify('Draft deleted');
    },
    onError: failed('Could not delete draft'),
  });
  const voidInvoice = useMutation({
    mutationFn: (reason: string) => api<Invoice>(`/invoices/${id}/void`, { method: 'POST', body: { reason } }),
    onSuccess: () => {
      setVoiding(false);
      refresh();
      notify('Invoice voided', 'It stays on record but no longer counts as owed.');
    },
    onError: failed('Could not void invoice'),
  });

  if (invoice.isPending) return <Loading />;
  if (invoice.isError) return <Screen><Body>{invoice.error.message}</Body></Screen>;
  const inv = invoice.data;
  const open = OPEN.includes(inv.status);
  const draft = inv.status === 'DRAFT';

  const askIssue = async () => {
    const ok = await confirm('Issue this invoice?', 'An issued invoice cannot be edited or deleted, only voided.', 'Issue');
    if (ok) issue.mutate();
  };
  const askDelete = async () => {
    const ok = await confirm(`Delete draft ${inv.invoiceNumber}?`, 'This removes the draft permanently.', 'Delete');
    if (ok) remove.mutate();
  };

  return (
    <Screen refreshing={invoice.isFetching} onRefresh={() => void invoice.refetch()}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Title>{inv.invoiceNumber}</Title>
        <StatusPill status={inv.status} />
      </View>
      <Label>
        {refName(inv.customerId)} · {draft ? 'Dated' : 'Issued'} {date(inv.issueDate)} · Due {date(inv.dueDate)}
      </Label>
      {inv.status === 'VOID' && inv.voidReason ? (
        <Card style={{ backgroundColor: t.border }}>
          <Label>Voided: {inv.voidReason}</Label>
        </Card>
      ) : null}
      <Card>
        <Label>{draft ? 'Total' : 'Balance due'}</Label>
        <Amount size={28}>{money(draft ? inv.totalMinor : inv.outstandingMinor, inv.currency)}</Amount>
        {!draft && (
          <Label>of {money(inv.totalMinor, inv.currency)} · {money(inv.allocatedMinor, inv.currency)} paid</Label>
        )}
      </Card>
      <Card style={{ gap: 10 }}>
        {inv.items.map((item, i) => (
          <View key={i} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
            <View style={{ flex: 1 }}>
              <Body>{item.description}</Body>
              <Label>{item.quantityMilli / 1000} × {money(item.unitPriceMinor, inv.currency)}</Label>
            </View>
            <Amount>{money(item.totalMinor, inv.currency)}</Amount>
          </View>
        ))}
        <View style={{ borderTopWidth: 1, borderTopColor: t.border, paddingTop: 10, gap: 4 }}>
          <Label>Subtotal {money(inv.subtotalMinor, inv.currency)} · GST {money(inv.taxMinor, inv.currency)}</Label>
          <Body bold>Total {money(inv.totalMinor, inv.currency)}</Body>
        </View>
      </Card>
      {draft && (
        <>
          {canIssue && <Button title="Issue invoice" icon="send-outline" loading={issue.isPending} onPress={() => void askIssue()} />}
          <Label>To change the items on a draft, open it on the website.</Label>
          {canWrite && (
            <Button title="Delete draft" variant="danger" icon="trash-outline" loading={remove.isPending} onPress={() => void askDelete()} />
          )}
        </>
      )}
      {open && (
        <>
          <Button
            title="Record payment"
            icon="wallet-outline"
            onPress={() => router.push({ pathname: '/payment/new', params: { customerId: refId(inv.customerId) } })}
          />
          <Button title="Email invoice to customer" variant="outline" icon="mail-outline" loading={send.isPending} onPress={() => send.mutate()} />
          {canVoid &&
            (voiding ? (
              <ReasonForm
                title="Void this invoice"
                hint={
                  inv.allocatedMinor > 0
                    ? 'Payments are applied to this invoice. Reverse them from the payment first, or voiding will be refused.'
                    : 'The invoice stays on record marked void and stops counting as owed. This cannot be undone.'
                }
                action="Void invoice"
                loading={voidInvoice.isPending}
                onSubmit={(reason) => voidInvoice.mutate(reason)}
                onCancel={() => setVoiding(false)}
              />
            ) : (
              <Button title="Void invoice" variant="danger" icon="close-circle-outline" onPress={() => setVoiding(true)} />
            ))}
        </>
      )}
    </Screen>
  );
}
