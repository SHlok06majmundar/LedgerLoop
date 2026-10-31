import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Card, Empty, Label, Row, Screen } from '@/components/ui';
import { api, apiPage } from '@/lib/api';
import { date } from '@/lib/format';

interface AppNotification {
  id: string;
  title: string;
  body?: string;
  readAt: string | null;
  createdAt: string;
}

export default function NotificationsScreen() {
  const queryClient = useQueryClient();
  const list = useQuery({
    queryKey: ['notifications'],
    queryFn: () => apiPage<AppNotification>('/notifications', { query: { limit: 50 }, noOrg: true }),
  });
  const readAll = useMutation({
    mutationFn: () => api('/notifications/read-all', { method: 'POST', noOrg: true }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  });

  return (
    <Screen refreshing={list.isFetching} onRefresh={() => void list.refetch()}>
      {(list.data?.meta.unread ?? 0) > 0 && (
        <Button title="Mark all as read" variant="outline" onPress={() => readAll.mutate()} loading={readAll.isPending} />
      )}
      {list.data?.items.length ? (
        <Card style={{ paddingVertical: 4 }}>
          {list.data.items.map((n) => (
            <Row key={n.id} title={`${n.readAt ? '' : '● '}${n.title}`} subtitle={n.body ?? date(n.createdAt)} />
          ))}
        </Card>
      ) : (
        <Empty icon="notifications-outline" title="No notifications yet" />
      )}
      <Label> </Label>
    </Screen>
  );
}
