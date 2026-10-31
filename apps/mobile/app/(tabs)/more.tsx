import { Ionicons } from '@expo/vector-icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { View } from 'react-native';
import { Body, Button, Card, Label, Row, Screen } from '@/components/ui';
import { api, API_URL, signOut } from '@/lib/api';
import { humanize } from '@/lib/format';
import { useSession } from '@/lib/session';
import type { Membership } from '@/lib/types';
import { useTheme } from '@/theme';

export default function MoreScreen() {
  const t = useTheme();
  const queryClient = useQueryClient();
  const { user, organizationId, setOrganization } = useSession();
  const memberships = useQuery({
    queryKey: ['memberships'],
    queryFn: () => api<Membership[]>('/organizations', { noOrg: true }),
  });

  return (
    <Screen>
      <Card>
        <Body bold>{user?.name}</Body>
        <Label>{user?.email}</Label>
      </Card>
      <Card style={{ paddingVertical: 4 }}>
        <Row title="Notifications" onPress={() => router.push('/notifications')} />
        <Row title="Record a payment" onPress={() => router.push('/payment/new')} />
      </Card>
      <Label>Organizations</Label>
      <Card style={{ paddingVertical: 4 }}>
        {(memberships.data ?? []).map((m) => (
          <Row
            key={m.id}
            title={m.organization.name}
            subtitle={humanize(m.role)}
            onPress={async () => {
              await setOrganization(m.organization.id);
              queryClient.removeQueries({ predicate: (q) => q.queryKey[0] !== 'memberships' });
              router.replace('/');
            }}
            right={m.organization.id === organizationId ? <Ionicons name="checkmark-circle" size={20} color={t.primary} /> : undefined}
          />
        ))}
      </Card>
      <View style={{ marginTop: 8 }}>
        <Button
          title="Sign out"
          variant="outline"
          icon="log-out-outline"
          onPress={async () => {
            await signOut();
            queryClient.clear();
          }}
        />
      </View>
      <Label>Connected to {API_URL}</Label>
    </Screen>
  );
}
