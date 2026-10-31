'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { resetPasswordSchema, type ResetPasswordInput } from '@ledgerloop/validation';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/input';
import { api } from '@/lib/api';
import { applyApiError } from '@/lib/auth';

function ResetForm() {
  const router = useRouter();
  const token = useSearchParams().get('token') ?? '';
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<ResetPasswordInput>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { token },
  });

  if (!token) {
    return (
      <p className="text-sm text-muted-foreground">
        This link is incomplete. <Link href="/forgot-password" className="text-primary hover:underline">Request a new one.</Link>
      </p>
    );
  }

  const onSubmit = handleSubmit(async (values) => {
    try {
      await api('/auth/reset-password', { method: 'POST', body: values, noOrg: true });
      toast.success('Password updated. Please sign in.');
      router.replace('/login');
    } catch (error) {
      applyApiError(error, setError);
    }
  });

  return (
    <form onSubmit={onSubmit} className="grid gap-4" noValidate>
      <input type="hidden" {...register('token')} />
      <Field
        label="New password"
        htmlFor="password"
        error={errors.password?.message ?? errors.token?.message}
        hint="At least 10 characters with upper and lower case letters and a number."
      >
        <Input id="password" type="password" autoComplete="new-password" autoFocus {...register('password')} />
      </Field>
      <Button type="submit" loading={isSubmitting}>
        Set new password
      </Button>
    </form>
  );
}

export default function ResetPasswordPage() {
  return (
    <div className="grid gap-6">
      <div className="grid gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Choose a new password</h1>
        <p className="text-sm text-muted-foreground">You will be signed out of every device.</p>
      </div>
      <Suspense>
        <ResetForm />
      </Suspense>
    </div>
  );
}
