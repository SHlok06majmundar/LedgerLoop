'use client';

import { CheckCircle2, XCircle } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useRef, useState } from 'react';
import { Skeleton } from '@/components/ui/feedback';
import { api, ApiError } from '@/lib/api';

function Verify() {
  const token = useSearchParams().get('token');
  const [state, setState] = useState<'pending' | 'ok' | 'failed'>('pending');
  const [message, setMessage] = useState('');
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    if (!token) {
      setState('failed');
      setMessage('This verification link is incomplete.');
      return;
    }
    api('/auth/verify-email', { method: 'POST', body: { token }, noOrg: true })
      .then(() => setState('ok'))
      .catch((err: unknown) => {
        setState('failed');
        setMessage(err instanceof ApiError ? err.message : 'Verification failed.');
      });
  }, [token]);

  if (state === 'pending') return <Skeleton className="h-24" />;
  const ok = state === 'ok';
  const Icon = ok ? CheckCircle2 : XCircle;
  return (
    <div className="grid gap-4 text-center">
      <Icon className={`mx-auto size-10 ${ok ? 'text-success' : 'text-danger'}`} />
      <h1 className="text-2xl font-semibold tracking-tight">{ok ? 'Email verified' : 'Could not verify'}</h1>
      <p className="text-sm text-muted-foreground">
        {ok ? 'Thanks for confirming your email address.' : message}
      </p>
      <Link href="/dashboard" className="text-sm font-medium text-primary hover:underline">
        Continue to LedgerLoop
      </Link>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense>
      <Verify />
    </Suspense>
  );
}
