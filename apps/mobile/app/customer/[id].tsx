import { Permission } from '@ledgerloop/shared-types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { Linking, View } from 'react-native';
import { Skeleton } from '@/components/skeleton';
import { Amount, Body, Button, Card, Label, Loading, Row, Screen, StatusPill, Title } from '@/components/ui';
import { api, ApiError, apiPage } from '@/lib/api';
import { date, humanize, money } from '@/lib/format';
import { confirm, notify } from '@/lib/notify';
import { useCan } from '@/lib/permissions';
import { useSession } from '@/lib/session';
import type { Customer, Invoice, Payment } from '@/lib/types';
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
  const queryClient = useQueryClient();
  const organizationId = useSession((s) => s.organizationId);
  const canWrite = useCan(Permission.CUSTOMERS_WRITE);
  const customer = useQuery({ queryKey: [organizationId, 'customers', id], queryFn: () => api<Customer>(`/customers/${id}`) });
  const summary = useQuery({ queryKey: [organizationId, 'customers', id, 'summary'], queryFn: () => api<Summary>(`/customers/${id}/summary`) });
  const invoices = useQuery({
    queryKey: [organizationId, 'customers', id, 'invoices'],
    queryFn: () => apiPage<Invoice>(`/customers/${id}/invoices`, { query: { status: 'OPEN', limit: 50 } }),
  });
  const payments = useQuery({
    queryKey: [organizationId, 'payments', { customerId: id }],
    queryFn: () => apiPage<Payment>('/payments', { query: { customerId: id, limit: 10, sort: 'paymentDate', order: 'desc' } }),
  });

  const archive = useMutation({
    mutationFn: (restore: boolean) =>
      restore ? api(`/customers/${id}/restore`, { method: 'POST' }) : api(`/customers/${id}`, { method: 'DELETE' }),
    onSuccess: (_data, restore) => {
      void queryClient.invalidateQueries({ queryKey: [organizationId, 'customers'] });
      notify(restore ? 'Customer restored' : 'Customer archived', restore ? 'You can invoice them again.' : 'Their invoices and payments are kept.');
    },
    onError: (e) => notify('Could not update customer', e instanceof ApiError ? e.message : 'Try again'),
  });

  if (customer.isPending) return <Loading />;
  if (customer.isError) return <Screen><Body>{customer.error.message}</Body></Screen>;
  const c = customer.data;
  const s = summary.data;
  const archived = Boolean(c.archivedAt);

  const askArchive = async () => {
    const ok = await confirm(
      `Archive ${c.name}?`,
      'They are hidden from lists and cannot be invoiced. Existing invoices and payments stay, and you can restore them later.',
      'Archive',
    );
    if (ok) archive.mutate(false);
  };

  return (
    <Screen
      refreshing={summary.isFetching}
      onRefresh={() => void Promise.all([customer.refetch(), summary.refetch(), invoices.refetch(), payments.refetch()])}
    >
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
        <View style={{ flex: 1 }}>
          <Title>{c.name}</Title>
        </View>
        {archived && <StatusPill status="ARCHIVED" />}
      </View>
      {c.gstin ? <Label>GSTIN {c.gstin}</Label> : null}
      {archived && (
        <Card style={{ backgroundColor: t.warningSoft, gap: 8 }}>
          <Body>Archived on {date(c.archivedAt)}. Restore this customer to invoice them again.</Body>
          {canWrite && <Button title="Restore customer" icon="refresh-outline" loading={archive.isPending} onPress={() => archive.mutate(true)} />}
        </Card>
      )}
      <View style={{ flexDirection: 'row', gap: 12 }}>
        <Card style={{ flex: 1 }}>
          <Label>Outstanding</Label>
          {s ? <Amount size={18}>{money(s.outstandingMinor)}</Amount> : <Skeleton width="80%" height={22} />}
        </Card>
        <Card style={{ flex: 1 }}>
          <Label>Overdue</Label>
          {s ? <Amount size={18} color={t.danger}>{money(s.overdueMinor)}</Amount> : <Skeleton width="80%" height={22} />}
        </Card>
      </View>
      <View style={{ flexDirection: 'row', gap: 12 }}>
        {c.phone ? (
          <View style={{ flex: 1 }}>
            <Button title="Call" variant="outline" icon="call-outline" onPress={() => void Linking.openURL(`tel:${c.phone}`)} />
          </View>
        ) : null}
        {c.email ? (
          <View style={{ flex: 1 }}>
            <Button title="Email" variant="outline" icon="mail-outline" onPress={() => void Linking.openURL(`mailto:${c.email}`)} />
          </View>
        ) : null}
      </View>
      {!archived && (
        <Button
          title="Record payment"
          icon="wallet-outline"
          onPress={() => router.push({ pathname: '/payment/new', params: { customerId: id } })}
        />
      )}
      <Body bold>Open invoices</Body>
      <Card style={{ paddingVertical: 4 }}>
        {invoices.isPending ? (
          <Skeleton height={60} style={{ marginVertical: 8 }} />
        ) : (invoices.data?.items ?? []).length === 0 ? (
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
      <Body bold>Recent payments</Body>
      <Card style={{ paddingVertical: 4 }}>
        {payments.isPending ? (
          <Skeleton height={60} style={{ marginVertical: 8 }} />
        ) : (payments.data?.items ?? []).length === 0 ? (
          <Label>No payments yet.</Label>
        ) : (
          payments.data!.items.map((p) => (
            <Row
              key={p.id}
              title={p.paymentNumber}
              subtitle={`${date(p.paymentDate)} · ${humanize(p.method)}${p.reference ? ` · ${p.reference}` : ''}`}
              onPress={() => router.push(`/payment/${p.id}`)}
              right={
                <View style={{ alignItems: 'flex-end', gap: 4 }}>
                  <Amount>{money(p.amountMinor)}</Amount>
                  {p.status === 'REVERSED' && <StatusPill status={p.status} />}
                </View>
              }
            />
          ))
        )}
      </Card>
      {canWrite && (
        <View style={{ gap: 12, marginTop: 4 }}>
          <Button
            title="Edit customer"
            variant="outline"
            icon="create-outline"
            onPress={() => router.push({ pathname: '/customer/form', params: { id } })}
          />
          {!archived && (
            <Button title="Archive customer" variant="danger" icon="archive-outline" loading={archive.isPending} onPress={() => void askArchive()} />
          )}
        </View>
      )}
    </Screen>
  );
}
