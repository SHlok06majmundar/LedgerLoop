import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { FlatList, RefreshControl, TextInput, View } from 'react-native';
import { Empty, Loading, Row } from '@/components/ui';
import { apiPage } from '@/lib/api';
import { useSession } from '@/lib/session';
import type { Customer } from '@/lib/types';
import { useTheme } from '@/theme';

export default function CustomersScreen() {
  const t = useTheme();
  const organizationId = useSession((s) => s.organizationId);
  const [search, setSearch] = useState('');
  const query = useQuery({
    queryKey: [organizationId, 'customers', search],
    queryFn: () => apiPage<Customer>('/customers', { query: { search, limit: 50, sort: 'name', order: 'asc' } }),
    placeholderData: (prev) => prev,
  });

  return (
    <View style={{ flex: 1, backgroundColor: t.background }}>
      <View style={{ padding: 16, paddingBottom: 8 }}>
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Search customers"
          placeholderTextColor={t.muted}
          accessibilityLabel="Search customers"
          style={{ minHeight: 44, borderRadius: 12, borderWidth: 1, borderColor: t.input, backgroundColor: t.card, paddingHorizontal: 14, color: t.text }}
        />
      </View>
      {query.isPending ? (
        <Loading />
      ) : (
        <FlatList
          data={query.data?.items ?? []}
          keyExtractor={(c) => c.id}
          contentContainerStyle={{ paddingHorizontal: 16 }}
          refreshControl={<RefreshControl refreshing={query.isFetching} onRefresh={() => void query.refetch()} tintColor={t.primary} />}
          ListEmptyComponent={<Empty icon="people-outline" title="No customers found" />}
          renderItem={({ item }) => (
            <Row
              title={item.name}
              subtitle={[item.email, item.phone].filter(Boolean).join(' · ') || `${item.paymentTermsDays}-day terms`}
              onPress={() => router.push(`/customer/${item.id}`)}
            />
          )}
        />
      )}
    </View>
  );
}
