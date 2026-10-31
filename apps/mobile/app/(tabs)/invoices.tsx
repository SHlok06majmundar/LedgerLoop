import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { FlatList, RefreshControl, View } from 'react-native';
import { Amount, Chips, Empty, Loading, Row, StatusPill } from '@/components/ui';
import { apiPage } from '@/lib/api';
import { date, money } from '@/lib/format';
import { useSession } from '@/lib/session';
import { refName, type Invoice } from '@/lib/types';
import { useTheme } from '@/theme';

const FILTERS = [
  { value: 'OPEN', label: 'Open' },
  { value: 'OVERDUE', label: 'Overdue' },
  { value: 'PAID', label: 'Paid' },
  { value: '', label: 'All' },
];

export default function InvoicesScreen() {
  const t = useTheme();
  const organizationId = useSession((s) => s.organizationId);
  const [status, setStatus] = useState('OPEN');
  const query = useQuery({
    queryKey: [organizationId, 'invoices', status],
    queryFn: () => apiPage<Invoice>('/invoices', { query: { status, limit: 50 } }),
  });

  return (
    <View style={{ flex: 1, backgroundColor: t.background }}>
      <View style={{ padding: 16, paddingBottom: 8 }}>
        <Chips value={status} options={FILTERS} onChange={setStatus} />
      </View>
      {query.isPending ? (
        <Loading />
      ) : (
        <FlatList
          data={query.data?.items ?? []}
          keyExtractor={(i) => i.id}
          contentContainerStyle={{ paddingHorizontal: 16 }}
          refreshControl={<RefreshControl refreshing={query.isFetching} onRefresh={() => void query.refetch()} tintColor={t.primary} />}
          ListEmptyComponent={<Empty icon="document-text-outline" title="No invoices here" />}
          renderItem={({ item }) => (
            <Row
              title={`${item.invoiceNumber} · ${refName(item.customerId)}`}
              subtitle={`Due ${date(item.dueDate)}`}
              onPress={() => router.push(`/invoice/${item.id}`)}
              right={
                <View style={{ alignItems: 'flex-end', gap: 4 }}>
                  <Amount>{money(item.outstandingMinor, item.currency)}</Amount>
                  <StatusPill status={item.status} />
                </View>
              }
            />
          )}
        />
      )}
    </View>
  );
}
