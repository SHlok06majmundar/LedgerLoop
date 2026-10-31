import { useMutation, useQuery } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { Alert, View } from 'react-native';
import { Amount, Body, Button, Card, Label, Loading, Screen, StatusPill, Title } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { date, money } from '@/lib/format';
import { useSession } from '@/lib/session';
import { refId, refName, type Invoice } from '@/lib/types';
import { useTheme } from '@/theme';

const OPEN = ['ISSUED', 'PARTIALLY_PAID', 'OVERDUE'];

export default function InvoiceScreen() {
  const t = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const organizationId = useSession((s) => s.organizationId);
  const invoice = useQuery({ queryKey: [organizationId, 'invoices', id], queryFn: () => api<Invoice>(`/invoices/${id}`) });
  const send = useMutation({
    mutationFn: () => api(`/invoices/${id}/send`, { method: 'POST', body: {} }),
    onSuccess: () => Alert.alert('Invoice emailed', 'The PDF is on its way to the customer.'),
    onError: (e) => Alert.alert('Could not send', e instanceof ApiError ? e.message : 'Try again'),
  });

  if (invoice.isPending) return <Loading />;
  if (invoice.isError) return <Screen><Body>{invoice.error.message}</Body></Screen>;
  const inv = invoice.data;
  const open = OPEN.includes(inv.status);

  return (
    <Screen refreshing={invoice.isFetching} onRefresh={() => void invoice.refetch()}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Title>{inv.invoiceNumber}</Title>
        <StatusPill status={inv.status} />
      </View>
      <Label>{refName(inv.customerId)} · Issued {date(inv.issueDate)} · Due {date(inv.dueDate)}</Label>
      <Card>
        <Label>Balance due</Label>
        <Amount size={28}>{money(inv.outstandingMinor, inv.currency)}</Amount>
        <Label>of {money(inv.totalMinor, inv.currency)} · {money(inv.allocatedMinor, inv.currency)} paid</Label>
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
      {open && (
        <>
          <Button
            title="Record payment"
            icon="wallet-outline"
            onPress={() => router.push({ pathname: '/payment/new', params: { customerId: refId(inv.customerId) } })}
          />
          <Button title="Email invoice to customer" variant="outline" icon="mail-outline" loading={send.isPending} onPress={() => send.mutate()} />
        </>
      )}
    </Screen>
  );
}
