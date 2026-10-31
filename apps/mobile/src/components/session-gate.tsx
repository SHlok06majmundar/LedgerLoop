import { useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, type ReactNode } from 'react';
import { restoreSession } from '@/lib/api';
import { useSession } from '@/lib/session';

/** Restores the session once at launch, then keeps signed-out users on the login screen. */
export function SessionGate({ children }: { children: ReactNode }) {
  const router = useRouter();
  const segments = useSegments();
  const { ready, accessToken, markReady } = useSession();

  useEffect(() => {
    void restoreSession().finally(() => {
      markReady();
      void SplashScreen.hideAsync();
    });
  }, [markReady]);

  useEffect(() => {
    if (!ready) return;
    const onLogin = segments[0] === 'login';
    if (!accessToken && !onLogin) router.replace('/login');
    else if (accessToken && onLogin) router.replace('/');
  }, [ready, accessToken, segments, router]);

  return <>{children}</>;
}
