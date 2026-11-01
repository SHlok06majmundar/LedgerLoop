import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { FlatList, RefreshControl, View } from 'react-native';
import { SkeletonList } from '@/components/skeleton';
import { Amount, Chips, Empty, Row, StatusPill } from '@/components/ui';
import { apiPage } from '@/lib/api';
import { date, humanize, money } from '@/lib/format';
import { useSession } from '@/lib/session';
import { refName, type Payment } from '@/lib/types';
import { useTheme } from '@/theme';

type Filter = 'ALL' | 'POSTED' | 'REVERSED';

export default function PaymentsScreen() {
  const t = useTheme();
  const organizationId = useSession((s) => s.organizationId);
  const [status, setStatus] = useState<Filter>('ALL');
  const query = useQuery({
    queryKey: [organizationId, 'payments', status],
    queryFn: () =>
      apiPage<Payment>('/payments', {
        query: { status: status === 'ALL' ? undefined : status, limit: 50, sort: 'paymentDate', order: 'desc' },
      }),
    placeholderData: (prev) => prev,
  });

  return (
    <View style={{ flex: 1, backgroundColor: t.background }}>
      <View style={{ padding: 16, paddingBottom: 8 }}>
        <Chips
          value={status}
          options={[
            { value: 'ALL', label: 'All' },
            { value: 'POSTED', label: 'Posted' },
            { value: 'REVERSED', label: 'Reversed' },
          ]}
          onChange={setStatus}
        />
      </View>
      {query.isPending ? (
        <SkeletonList />
      ) : (
        <FlatList
          data={query.data?.items ?? []}
          keyExtractor={(p) => p.id}
          contentContainerStyle={{ paddingHorizontal: 16 }}
          refreshControl={<RefreshControl refreshing={query.isFetching} onRefresh={() => void query.refetch()} tintColor={t.primary} />}
          ListEmptyComponent={<Empty icon="wallet-outline" title="No payments yet" />}
          renderItem={({ item }) => (
            <Row
              title={`${item.paymentNumber} · ${refName(item.customerId)}`}
              subtitle={`${date(item.paymentDate)} · ${humanize(item.method)}${item.reference ? ` · ${item.reference}` : ''}`}
              onPress={() => router.push(`/payment/${item.id}`)}
              right={
                <View style={{ alignItems: 'flex-end', gap: 4 }}>
                  <Amount color={item.status === 'REVERSED' ? t.muted : undefined}>{money(item.amountMinor)}</Amount>
                  {item.status === 'REVERSED' && <StatusPill status={item.status} />}
                </View>
              }
            />
          )}
        />
      )}
    </View>
  );
}
