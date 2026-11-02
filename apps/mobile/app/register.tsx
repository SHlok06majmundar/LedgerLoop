import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { Text } from 'react-native';
import { Button, FormScreen, Input, LogoBadge, PasswordInput, type TextField } from '@/components/ui';
import { ApiError, signUp } from '@/lib/api';
import { useTheme } from '@/theme';

export default function RegisterScreen() {
  const t = useTheme();
  const emailRef = useRef<TextField>(null);
  const passwordRef = useRef<TextField>(null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const filled = name.trim().length > 0 && email.trim().length > 0 && password.length > 0;

  const submit = async () => {
    if (!filled || busy) return;
    setError('');
    setBusy(true);
    try {
      // The session gate moves on to business setup once the session is stored.
      await signUp(name.trim(), email.trim(), password);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <FormScreen>
      <LogoBadge />
      <Text style={{ color: t.text, fontSize: 28, fontWeight: '700' }}>Create your account</Text>
      <Text style={{ color: t.muted, fontSize: 15 }}>Free to start. You can invite your team later.</Text>
      <Input
        label="Full name"
        value={name}
        onChangeText={setName}
        autoComplete="name"
        textContentType="name"
        returnKeyType="next"
        submitBehavior="submit"
        onSubmitEditing={() => emailRef.current?.focus()}
      />
      <Input
        ref={emailRef}
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
        autoComplete="new-password"
        textContentType="newPassword"
        placeholder="10+ characters, upper and lower case, a number"
        returnKeyType="go"
        onSubmitEditing={submit}
      />
      {error ? (
        <Text accessibilityRole="alert" style={{ color: t.danger }}>
          {error}
        </Text>
      ) : null}
      <Button title="Create account" onPress={submit} loading={busy} disabled={!filled} />
      <Button title="I already have an account" variant="outline" onPress={() => router.replace('/login')} />
    </FormScreen>
  );
}
