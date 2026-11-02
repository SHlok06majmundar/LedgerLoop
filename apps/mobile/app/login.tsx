import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { Button, FormScreen, Input, LogoBadge, PasswordInput, type TextField } from '@/components/ui';
import { ApiError, signIn } from '@/lib/api';
import { useTheme } from '@/theme';

export default function LoginScreen() {
  const t = useTheme();
  const passwordRef = useRef<TextField>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const canSubmit = email.trim().length > 0 && password.length > 0 && !busy;

  const submit = async () => {
    if (!canSubmit) return;
    setError('');
    setBusy(true);
    try {
      // The session gate opens the app once the session is stored.
      await signIn(email.trim(), password);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <FormScreen>
      <View style={{ gap: 6, marginBottom: 12 }}>
        <View style={{ marginBottom: 12 }}>
          <LogoBadge />
        </View>
        <Text style={{ color: t.text, fontSize: 28, fontWeight: '700' }}>LedgerLoop</Text>
        <Text style={{ color: t.muted, fontSize: 15 }}>Sign in to see what is owed and what has been paid.</Text>
      </View>
      <Input
        label="Email"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="email-address"
        autoComplete="email"
        textContentType="emailAddress"
        returnKeyType="next"
        submitBehavior="submit"
        onSubmitEditing={() => passwordRef.current?.focus()}
      />
      <PasswordInput
        ref={passwordRef}
        label="Password"
        value={password}
        onChangeText={setPassword}
        autoComplete="password"
        textContentType="password"
        returnKeyType="go"
        onSubmitEditing={submit}
      />
      {error ? (
        <Text accessibilityRole="alert" style={{ color: t.danger }}>
          {error}
        </Text>
      ) : null}
      <Button title="Sign in" onPress={submit} loading={busy} disabled={!email.trim() || !password} />
      <Button title="Create an account" variant="outline" onPress={() => router.replace('/register')} />
    </FormScreen>
  );
}
