import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Text, View } from 'react-native';
import { Button, Input, SafeScreen } from '@/components/ui';
import { api, ApiError, signIn } from '@/lib/api';
import { useSession } from '@/lib/session';
import { useTheme } from '@/theme';

interface Membership {
  organization: { id: string };
}

export default function LoginScreen() {
  const t = useTheme();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setError('');
    setBusy(true);
    try {
      await signIn(email.trim(), password);
      const memberships = await api<Membership[]>('/organizations', { noOrg: true });
      const current = useSession.getState().organizationId;
      if (memberships.length && !memberships.some((m) => m.organization.id === current)) {
        await useSession.getState().setOrganization(memberships[0]!.organization.id);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not reach LedgerLoop. Check your connection.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeScreen>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, justifyContent: 'center', padding: 24, gap: 16 }}>
        <View style={{ gap: 6, marginBottom: 12 }}>
          <View style={{ width: 48, height: 48, borderRadius: 12, backgroundColor: t.primary, marginBottom: 12 }} />
          <Text style={{ color: t.text, fontSize: 28, fontWeight: '700' }}>LedgerLoop</Text>
          <Text style={{ color: t.muted, fontSize: 15 }}>Sign in to see what is owed and what has been paid.</Text>
        </View>
        <Input label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" textContentType="emailAddress" />
        <Input label="Password" value={password} onChangeText={setPassword} secureTextEntry autoComplete="password" textContentType="password" onSubmitEditing={submit} />
        {error ? <Text style={{ color: t.danger }}>{error}</Text> : null}
        <Button title="Sign in" onPress={submit} loading={busy} disabled={!email || !password} />
        <Text style={{ color: t.muted, textAlign: 'center', fontSize: 13 }}>
          New to LedgerLoop? Create your account on the web, then sign in here.
        </Text>
      </KeyboardAvoidingView>
    </SafeScreen>
  );
}
