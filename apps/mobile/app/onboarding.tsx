import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { Text } from 'react-native';
import { Button, Input, Screen } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { useSession } from '@/lib/session';
import { useTheme } from '@/theme';

/** First organization for a new account. */
export default function OnboardingScreen() {
  const t = useTheme();
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const create = async () => {
    setBusy(true);
    setError('');
    try {
      const org = await api<{ id: string }>('/organizations', {
        method: 'POST',
        body: { name: name.trim() },
        noOrg: true,
      });
      await useSession.getState().setOrganization(org.id);
      await queryClient.invalidateQueries({ queryKey: ['memberships'] });
      router.replace('/');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <Text style={{ color: t.text, fontSize: 24, fontWeight: '700' }}>Set up your business</Text>
      <Text style={{ color: t.muted }}>Invoices, payments and reminders are kept per business.</Text>
      <Input label="Business name" value={name} onChangeText={setName} placeholder="ABC Traders Pvt Ltd" />
      {error ? <Text style={{ color: t.danger }}>{error}</Text> : null}
      <Button title="Create business" onPress={create} loading={busy} disabled={name.trim().length < 2} />
    </Screen>
  );
}
