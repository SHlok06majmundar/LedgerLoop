import { useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { restoreSession, warmUp } from '@/lib/api';
import { useConnection } from '@/lib/connection';
import { useSession } from '@/lib/session';
import { useTheme } from '@/theme';
import { Button, LogoBadge } from './ui';

/**
 * Restores the session once at launch, then keeps signed-out users on the login
 * screen. While the server is unreachable it offers a retry instead of a blank screen.
 */
export function SessionGate({ children }: { children: ReactNode }) {
  const router = useRouter();
  const segments = useSegments();
  const { ready, accessToken, organizationId, markReady } = useSession();
  const [offline, setOffline] = useState(false);

  const start = useCallback(() => {
    setOffline(false);
    void restoreSession()
      .then((outcome) => {
        if (outcome === 'offline') setOffline(true);
        else markReady();
      })
      .finally(() => void SplashScreen.hideAsync());
  }, [markReady]);

  useEffect(() => {
    // Start waking the server at once; the login screen is usually next.
    warmUp();
    start();
  }, [start]);

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

  return (
    <>
      {children}
      {/* Covers the app until the stored session has been checked. */}
      {!ready && <StartupScreen offline={offline} onRetry={start} />}
      <SlowConnectionNotice />
    </>
  );
}

function StartupScreen({ offline, onRetry }: { offline: boolean; onRetry: () => void }) {
  const t = useTheme();
  const slow = useConnection((s) => s.slow);
  return (
    <View style={[StyleSheet.absoluteFill, styles.center, { backgroundColor: t.background }]}>
      <LogoBadge size={72} />
      {offline ? (
        <>
          <Text style={[styles.title, { color: t.text }]}>Can't reach LedgerLoop</Text>
          <Text style={[styles.body, { color: t.muted }]}>
            Check that your phone is online, then try again. You are still signed in.
          </Text>
          <View style={{ alignSelf: 'stretch' }}>
            <Button title="Try again" icon="refresh" onPress={onRetry} />
          </View>
        </>
      ) : (
        <>
          <ActivityIndicator color={t.primary} size="large" />
          {slow && (
            <Text style={[styles.body, { color: t.muted }]}>
              Waking up the server. After a quiet spell this can take up to a minute.
            </Text>
          )}
        </>
      )}
    </View>
  );
}

/** A small banner while any request is taking longer than usual. */
function SlowConnectionNotice() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const slow = useConnection((s) => s.slow);
  const ready = useSession((s) => s.ready);
  if (!slow || !ready) return null;
  return (
    <View
      pointerEvents="none"
      accessibilityLiveRegion="polite"
      style={[styles.notice, { top: insets.top + 8, backgroundColor: t.text }]}
    >
      <ActivityIndicator color={t.background} size="small" />
      <Text style={{ color: t.background, fontSize: 13, flexShrink: 1 }}>
        Connecting to LedgerLoop… the server can take up to a minute to wake up.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center', gap: 20, padding: 32 },
  title: { fontSize: 20, fontWeight: '700', textAlign: 'center' },
  body: { fontSize: 15, textAlign: 'center', lineHeight: 21 },
  notice: {
    position: 'absolute',
    left: 16,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 12,
    opacity: 0.92,
  },
});
