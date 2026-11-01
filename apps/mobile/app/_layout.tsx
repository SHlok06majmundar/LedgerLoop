import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { Providers } from '@/components/providers';
import { SessionGate } from '@/components/session-gate';
import { useTheme } from '@/theme';

void SplashScreen.preventAutoHideAsync();

function Navigator() {
  const t = useTheme();
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: t.card },
        headerTintColor: t.text,
        contentStyle: { backgroundColor: t.background },
      }}
    >
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="login" options={{ headerShown: false }} />
      <Stack.Screen name="register" options={{ headerShown: false }} />
      <Stack.Screen name="onboarding" options={{ title: 'Your business' }} />
      <Stack.Screen name="invoice/[id]" options={{ title: 'Invoice' }} />
      <Stack.Screen name="customer/[id]" options={{ title: 'Customer' }} />
      <Stack.Screen name="customer/form" options={{ title: 'Customer', presentation: 'modal' }} />
      <Stack.Screen name="payment/new" options={{ title: 'Record payment', presentation: 'modal' }} />
      <Stack.Screen name="payment/[id]" options={{ title: 'Payment' }} />
      <Stack.Screen name="payments" options={{ title: 'Payments' }} />
      <Stack.Screen name="notifications" options={{ title: 'Notifications' }} />
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <Providers>
      <SessionGate>
        <StatusBar style="auto" />
        <Navigator />
      </SessionGate>
    </Providers>
  );
}
