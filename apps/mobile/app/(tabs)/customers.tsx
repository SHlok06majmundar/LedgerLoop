import { Permission } from '@ledgerloop/shared-types';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { FlatList, RefreshControl, TextInput, View } from 'react-native';
import { SkeletonList } from '@/components/skeleton';
import { Button, Chips, Empty, Row } from '@/components/ui';
import { apiPage } from '@/lib/api';
import { useCan } from '@/lib/permissions';
import { useSession } from '@/lib/session';
import type { Customer } from '@/lib/types';
import { useTheme } from '@/theme';

export default function CustomersScreen() {
  const t = useTheme();
  const organizationId = useSession((s) => s.organizationId);
  const canWrite = useCan(Permission.CUSTOMERS_WRITE);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<'active' | 'archived'>('active');
  const query = useQuery({
    queryKey: [organizationId, 'customers', status, search],
    queryFn: () => apiPage<Customer>('/customers', { query: { search, status, limit: 50, sort: 'name', order: 'asc' } }),
    placeholderData: (prev) => prev,
  });

  return (
    <View style={{ flex: 1, backgroundColor: t.background }}>
      <View style={{ padding: 16, paddingBottom: 8, gap: 10 }}>
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Search customers"
          placeholderTextColor={t.muted}
          accessibilityLabel="Search customers"
          style={{ minHeight: 44, borderRadius: 12, borderWidth: 1, borderColor: t.input, backgroundColor: t.card, paddingHorizontal: 14, color: t.text }}
        />
        <Chips
          value={status}
          options={[
            { value: 'active', label: 'Active' },
            { value: 'archived', label: 'Archived' },
          ]}
          onChange={setStatus}
        />
        {canWrite && <Button title="Add customer" icon="person-add-outline" onPress={() => router.push('/customer/form')} />}
      </View>
      {query.isPending ? (
        <SkeletonList />
      ) : (
        <FlatList
          data={query.data?.items ?? []}
          keyExtractor={(c) => c.id}
          contentContainerStyle={{ paddingHorizontal: 16 }}
          refreshControl={<RefreshControl refreshing={query.isFetching} onRefresh={() => void query.refetch()} tintColor={t.primary} />}
          ListEmptyComponent={
            <Empty
              icon="people-outline"
              title={status === 'archived' ? 'No archived customers' : 'No customers found'}
              hint={status === 'active' && canWrite && !search ? 'Add your first customer to start invoicing.' : undefined}
            />
          }
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
