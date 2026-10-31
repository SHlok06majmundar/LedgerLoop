import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { View } from 'react-native';
import { Skeleton } from '@/components/skeleton';
import { Amount, Body, Button, Card, Label, Screen, Title } from '@/components/ui';
import { api } from '@/lib/api';
import { money } from '@/lib/format';
import { useSession } from '@/lib/session';
import { useTheme } from '@/theme';

interface Dashboard {
  currency: string;
  totalOutstandingMinor: number;
  overdueMinor: number;
  overdueInvoices: number;
  totalReceivedMinor: number;
  collectionRateBps: number;
  unmatchedTransactions: number;
  partiallyPaidInvoices: number;
}

const BUCKETS: Record<string, string> = {
  NOT_DUE: 'Not due',
  DAYS_1_30: '1–30 days',
  DAYS_31_60: '31–60 days',
  DAYS_61_90: '61–90 days',
  DAYS_90_PLUS: '90+ days',
};

export default function HomeScreen() {
  const t = useTheme();
  const { user, organizationId } = useSession();
  const kpis = useQuery({
    queryKey: [organizationId, 'dashboard'],
    queryFn: () => api<Dashboard>('/analytics/dashboard'),
    enabled: Boolean(organizationId),
  });
  const aging = useQuery({
    queryKey: [organizationId, 'aging'],
    queryFn: () => api<{ buckets: { bucket: string; amountMinor: number; invoices: number }[] }>('/analytics/aging'),
    enabled: Boolean(organizationId),
  });
  const k = kpis.data;
  const c = k?.currency ?? 'INR';
  const maxAging = Math.max(1, ...(aging.data?.buckets.map((b) => b.amountMinor) ?? [1]));

  return (
    <Screen refreshing={kpis.isFetching} onRefresh={() => void Promise.all([kpis.refetch(), aging.refetch()])}>
      <Title>Hi {user?.name.split(' ')[0]}</Title>
      <Card>
        <Label>Total outstanding</Label>
        {k ? <Amount size={30}>{money(k.totalOutstandingMinor, c)}</Amount> : <Skeleton width="60%" height={34} style={{ marginVertical: 4 }} />}
        <Label>{k ? `${k.partiallyPaidInvoices} partially paid invoices` : ' '}</Label>
      </Card>
      <View style={{ flexDirection: 'row', gap: 12 }}>
        <Card style={{ flex: 1 }}>
          <Label>Overdue</Label>
          {k ? <Amount size={18} color={t.danger}>{money(k.overdueMinor, c)}</Amount> : <Skeleton width="80%" height={22} style={{ marginVertical: 2 }} />}
          <Label>{k?.overdueInvoices ?? 0} invoices</Label>
        </Card>
        <Card style={{ flex: 1 }}>
          <Label>Received</Label>
          {k ? <Amount size={18} color={t.success}>{money(k.totalReceivedMinor, c)}</Amount> : <Skeleton width="80%" height={22} style={{ marginVertical: 2 }} />}
          <Label>{k ? `${(k.collectionRateBps / 100).toFixed(1)}% collected` : ' '}</Label>
        </Card>
      </View>
      {k && k.unmatchedTransactions > 0 && (
        <Card style={{ backgroundColor: t.warningSoft, borderColor: t.warningSoft }}>
          <Body bold color={t.warning}>{k.unmatchedTransactions} bank credits need review</Body>
          <View style={{ marginTop: 10 }}>
            <Button title="Review matches" variant="outline" onPress={() => router.push('/reconcile')} />
          </View>
        </Card>
      )}
      <Card style={{ gap: 12 }}>
        <Body bold>Outstanding by age</Body>
        {!aging.data && [0, 1, 2, 3, 4].map((i) => <Skeleton key={i} height={26} />)}
        {(aging.data?.buckets ?? []).map((b) => (
          <View key={b.bucket} style={{ gap: 4 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Label>{BUCKETS[b.bucket] ?? b.bucket} · {b.invoices}</Label>
              <Amount size={13}>{money(b.amountMinor, c)}</Amount>
            </View>
            <View style={{ height: 6, borderRadius: 3, backgroundColor: t.border }}>
              <View style={{ height: 6, borderRadius: 3, width: `${(b.amountMinor / maxAging) * 100}%`, backgroundColor: t.primary }} />
            </View>
          </View>
        ))}
      </Card>
      <Button title="Record a payment" icon="wallet-outline" onPress={() => router.push('/payment/new')} />
    </Screen>
  );
}
