import { router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Text } from 'react-native';
import { Button, Input, SafeScreen } from '@/components/ui';
import { ApiError, signUp } from '@/lib/api';
import { useTheme } from '@/theme';

export default function RegisterScreen() {
  const t = useTheme();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setError('');
    setBusy(true);
    try {
      await signUp(name.trim(), email.trim(), password);
      router.replace('/onboarding');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not reach LedgerLoop. Check your connection.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeScreen>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 24, gap: 16 }}>
          <Text style={{ color: t.text, fontSize: 28, fontWeight: '700' }}>Create your account</Text>
          <Text style={{ color: t.muted, fontSize: 15 }}>Free to start. You can invite your team later.</Text>
          <Input label="Full name" value={name} onChangeText={setName} autoComplete="name" />
          <Input label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" />
          <Input
            label="Password"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoComplete="new-password"
            placeholder="10+ characters, upper and lower case, a number"
          />
          {error ? <Text style={{ color: t.danger }}>{error}</Text> : null}
          <Button title="Create account" onPress={submit} loading={busy} disabled={!name || !email || !password} />
          <Button title="I already have an account" variant="outline" onPress={() => router.replace('/login')} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeScreen>
  );
}
