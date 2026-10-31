import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, View } from 'react-native';
import { Amount, Body, Button, Card, Empty, Label, Screen, StatusPill } from '@/components/ui';
import { api, ApiError, apiPage } from '@/lib/api';
import { date, money } from '@/lib/format';
import { useSession } from '@/lib/session';
import type { Match } from '@/lib/types';
import { useTheme } from '@/theme';

export default function ReconcileScreen() {
  const t = useTheme();
  const queryClient = useQueryClient();
  const organizationId = useSession((s) => s.organizationId);
  const suggestions = useQuery({
    queryKey: [organizationId, 'matches', 'SUGGESTED'],
    queryFn: () => apiPage<Match>('/reconciliation/matches', { query: { status: 'SUGGESTED', limit: 30 } }),
  });
  const decide = useMutation({
    mutationFn: ({ id, approve }: { id: string; approve: boolean }) =>
      api(`/reconciliation/matches/${id}/${approve ? 'approve' : 'reject'}`, {
        method: 'POST',
        body: approve ? undefined : { reason: 'Rejected from mobile app' },
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [organizationId] }),
    onError: (e) => Alert.alert('Could not update match', e instanceof ApiError ? e.message : 'Try again'),
  });
  const pending = (suggestions.data?.items ?? []).filter((m) => !m.decision);

  return (
    <Screen refreshing={suggestions.isFetching} onRefresh={() => void suggestions.refetch()}>
      <Label>Suggested matches waiting for approval</Label>
      {pending.length === 0 && !suggestions.isPending ? (
        <Empty icon="checkmark-done-outline" title="All caught up" hint="New suggestions appear after you import a bank statement on the web." />
      ) : null}
      {pending.map((m) => (
        <Card key={m.id} style={{ gap: 10 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Amount size={20}>{money(m.bankTransactionId.amountMinor)}</Amount>
            <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
              <Label>Score {m.score}</Label>
              <StatusPill status={m.status} />
            </View>
          </View>
          <Label>{date(m.bankTransactionId.transactionDate)} · {m.bankTransactionId.description}</Label>
          <Body bold>
            {m.customerId?.name ?? 'Unknown customer'} →{' '}
            {m.paymentId?.paymentNumber ?? m.invoiceIds.map((i) => i.invoiceNumber).join(', ')}
          </Body>
          <View style={{ gap: 4 }}>
            {m.signals.map((s) => (
              <Label key={s.code}>✓ {s.detail} (+{s.points})</Label>
            ))}
            {m.blocks.map((b) => (
              <Body key={b} color={t.danger}>⚠ {b.replace(/_/g, ' ').toLowerCase()}</Body>
            ))}
          </View>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <View style={{ flex: 1 }}>
              <Button title="Reject" variant="outline" onPress={() => decide.mutate({ id: m.id, approve: false })} />
            </View>
            <View style={{ flex: 1 }}>
              <Button
                title="Approve"
                loading={decide.isPending && decide.variables?.id === m.id && decide.variables.approve}
                onPress={() => decide.mutate({ id: m.id, approve: true })}
              />
            </View>
          </View>
        </Card>
      ))}
    </Screen>
  );
}
