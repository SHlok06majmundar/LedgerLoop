import { useQuery } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { Linking, View } from 'react-native';
import { Amount, Body, Button, Card, Label, Loading, Row, Screen, StatusPill, Title } from '@/components/ui';
import { api, apiPage } from '@/lib/api';
import { date, money } from '@/lib/format';
import { useSession } from '@/lib/session';
import type { Customer, Invoice } from '@/lib/types';
import { useTheme } from '@/theme';

interface Summary {
  outstandingMinor: number;
  overdueMinor: number;
  totalInvoicedMinor: number;
  totalReceivedMinor: number;
  openInvoices: number;
}

export default function CustomerScreen() {
  const t = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const organizationId = useSession((s) => s.organizationId);
  const customer = useQuery({ queryKey: [organizationId, 'customers', id], queryFn: () => api<Customer>(`/customers/${id}`) });
  const summary = useQuery({ queryKey: [organizationId, 'customers', id, 'summary'], queryFn: () => api<Summary>(`/customers/${id}/summary`) });
  const invoices = useQuery({
    queryKey: [organizationId, 'customers', id, 'invoices'],
    queryFn: () => apiPage<Invoice>(`/customers/${id}/invoices`, { query: { status: 'OPEN', limit: 50 } }),
  });

  if (customer.isPending) return <Loading />;
  const c = customer.data;
  const s = summary.data;

  return (
    <Screen refreshing={summary.isFetching} onRefresh={() => void Promise.all([summary.refetch(), invoices.refetch()])}>
      <Title>{c?.name}</Title>
      {c?.gstin ? <Label>GSTIN {c.gstin}</Label> : null}
      <View style={{ flexDirection: 'row', gap: 12 }}>
        <Card style={{ flex: 1 }}>
          <Label>Outstanding</Label>
          <Amount size={18}>{money(s?.outstandingMinor)}</Amount>
        </Card>
        <Card style={{ flex: 1 }}>
          <Label>Overdue</Label>
          <Amount size={18} color={t.danger}>{money(s?.overdueMinor)}</Amount>
        </Card>
      </View>
      <View style={{ flexDirection: 'row', gap: 12 }}>
        {c?.phone ? (
          <View style={{ flex: 1 }}>
            <Button title="Call" variant="outline" icon="call-outline" onPress={() => void Linking.openURL(`tel:${c.phone}`)} />
          </View>
        ) : null}
        {c?.email ? (
          <View style={{ flex: 1 }}>
            <Button title="Email" variant="outline" icon="mail-outline" onPress={() => void Linking.openURL(`mailto:${c.email}`)} />
          </View>
        ) : null}
      </View>
      <Button
        title="Record payment"
        icon="wallet-outline"
        onPress={() => router.push({ pathname: '/payment/new', params: { customerId: id } })}
      />
      <Body bold>Open invoices</Body>
      <Card style={{ paddingVertical: 4 }}>
        {(invoices.data?.items ?? []).length === 0 ? (
          <Label>No open invoices.</Label>
        ) : (
          invoices.data!.items.map((inv) => (
            <Row
              key={inv.id}
              title={inv.invoiceNumber}
              subtitle={`Due ${date(inv.dueDate)}`}
              onPress={() => router.push(`/invoice/${inv.id}`)}
              right={
                <View style={{ alignItems: 'flex-end', gap: 4 }}>
                  <Amount>{money(inv.outstandingMinor, inv.currency)}</Amount>
                  <StatusPill status={inv.status} />
                </View>
              }
            />
          ))
        )}
      </Card>
    </Screen>
  );
}
