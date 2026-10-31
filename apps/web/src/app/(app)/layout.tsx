'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { AuthGate } from '@/components/app/auth-gate';
import { useRealtime } from '@/components/app/realtime';
import { Sidebar } from '@/components/app/sidebar';
import { Topbar } from '@/components/app/topbar';
import { Skeleton } from '@/components/ui/feedback';
import { useMemberships } from '@/lib/hooks';
import { useSession } from '@/lib/session';

/** Ensures the user belongs to an organization and one is selected. */
function OrganizationGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { data, isPending } = useMemberships();
  const { organizationId, setOrganization } = useSession();
  useRealtime();

  useEffect(() => {
    if (!data) return;
    if (data.length === 0) router.replace('/onboarding');
    else if (!data.some((m) => m.organization.id === organizationId)) {
      setOrganization(data[0]!.organization.id);
    }
  }, [data, organizationId, router, setOrganization]);

  const ready = data && data.some((m) => m.organization.id === organizationId);
  if (isPending || !ready) {
    return (
      <div className="grid gap-4 p-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-32" />
        <Skeleton className="h-64" />
      </div>
    );
  }
  return <>{children}</>;
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGate>
      <div className="flex min-h-dvh">
        <Sidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <Topbar />
          <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 lg:py-8">
            <OrganizationGate>{children}</OrganizationGate>
          </main>
        </div>
      </div>
    </AuthGate>
  );
}
