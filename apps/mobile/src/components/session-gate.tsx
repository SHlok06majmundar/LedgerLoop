import { useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, type ReactNode } from 'react';
import { restoreSession } from '@/lib/api';
import { useSession } from '@/lib/session';

/** Restores the session once at launch, then keeps signed-out users on the login screen. */
export function SessionGate({ children }: { children: ReactNode }) {
  const router = useRouter();
  const segments = useSegments();
  const { ready, accessToken, organizationId, markReady } = useSession();

  useEffect(() => {
    void restoreSession().finally(() => {
      markReady();
      void SplashScreen.hideAsync();
    });
  }, [markReady]);

  useEffect(() => {
    if (!ready) return;
    const screen = segments[0];
    const signedOutScreen = screen === 'login' || screen === 'register';
    if (!accessToken) {
      if (!signedOutScreen) router.replace('/login');
    } else if (!organizationId) {
      if (screen !== 'onboarding') router.replace('/onboarding');
    } else if (signedOutScreen || screen === 'onboarding') {
      router.replace('/');
    }
  }, [ready, accessToken, organizationId, segments, router]);

  return <>{children}</>;
}
