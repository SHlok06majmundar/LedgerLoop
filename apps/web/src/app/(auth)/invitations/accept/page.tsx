'use client';

import { useQuery } from '@tanstack/react-query';
import { Building2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { ErrorState, Skeleton } from '@/components/ui/feedback';
import { api, refreshSession } from '@/lib/api';
import { applyApiError } from '@/lib/auth';
import { humanize } from '@/lib/format';
import { useSession } from '@/lib/session';

interface Preview {
  organizationName: string;
  email: string;
  role: string;
  invitedBy: string;
}

function Accept() {
  const router = useRouter();
  const token = useSearchParams().get('token') ?? '';
  const { user, setOrganization } = useSession();
  const [checked, setChecked] = useState(false);
  const [accepting, setAccepting] = useState(false);

  useEffect(() => {
    void refreshSession().finally(() => setChecked(true));
  }, []);

  const preview = useQuery({
    queryKey: ['invitation', token],
    queryFn: () => api<Preview>('/invitations/preview', { query: { token }, noOrg: true }),
    enabled: Boolean(token),
  });

  if (!token) return <ErrorState message="This invitation link is incomplete." />;
  if (preview.isPending || !checked) return <Skeleton className="h-40" />;
  if (preview.isError) return <ErrorState message={preview.error.message} />;

  const invite = preview.data;
  const next = `/invitations/accept?token=${encodeURIComponent(token)}`;

  const accept = async () => {
    setAccepting(true);
    try {
      const result = await api<{ organizationId: string }>('/invitations/accept', {
        method: 'POST',
        body: { token },
        noOrg: true,
      });
      setOrganization(result.organizationId);
      toast.success(`You joined ${invite.organizationName}`);
      router.replace('/dashboard');
    } catch (error) {
      applyApiError(error);
      setAccepting(false);
    }
  };

  return (
    <div className="grid gap-6 text-center">
      <Building2 className="mx-auto size-10 text-primary" />
      <div className="grid gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Join {invite.organizationName}</h1>
        <p className="text-sm text-muted-foreground">
          {invite.invitedBy} invited <span className="font-medium text-foreground">{invite.email}</span> as{' '}
          {humanize(invite.role).toLowerCase()}.
        </p>
      </div>
      {user ? (
        user.email === invite.email ? (
          <Button onClick={accept} loading={accepting}>
            Accept invitation
          </Button>
        ) : (
          <p className="rounded-lg bg-warning-soft p-3 text-sm text-warning">
            You are signed in as {user.email}. Sign out and sign in as {invite.email} to accept.
          </p>
        )
      ) : (
        <div className="grid gap-2">
          <Button asChild>
            <Link href={`/register?email=${encodeURIComponent(invite.email)}&next=${encodeURIComponent(next)}`}>
              Create account to join
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link href={`/login?next=${encodeURIComponent(next)}`}>I already have an account</Link>
          </Button>
        </div>
      )}
    </div>
  );
}

export default function AcceptInvitationPage() {
  return (
    <Suspense>
      <Accept />
    </Suspense>
  );
}
