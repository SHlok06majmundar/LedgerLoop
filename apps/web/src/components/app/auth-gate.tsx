'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { LogoMark } from '@/components/brand';
import { refreshSession } from '@/lib/api';
import { useSession } from '@/lib/session';

/** Restores the session from the refresh cookie, or sends the visitor to sign in. */
export function AuthGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const accessToken = useSession((s) => s.accessToken);
  const [checking, setChecking] = useState(!accessToken);

  useEffect(() => {
    if (accessToken) {
      setChecking(false);
      return;
    }
    let cancelled = false;
    void refreshSession().then((ok) => {
      if (cancelled) return;
      if (!ok) router.replace(`/login?next=${encodeURIComponent(pathname)}`);
      else setChecking(false);
    });
    return () => {
      cancelled = true;
    };
  }, [accessToken, pathname, router]);

  if (checking || !accessToken) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <LogoMark className="size-10 animate-pulse" />
      </div>
    );
  }
  return <>{children}</>;
}
