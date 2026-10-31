'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { registerSchema, type RegisterInput } from '@ledgerloop/validation';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { useForm } from 'react-hook-form';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/input';
import { api } from '@/lib/api';
import { applyApiError, completeSignIn, type AuthResponse } from '@/lib/auth';

function RegisterForm() {
  const router = useRouter();
  const params = useSearchParams();
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<RegisterInput>({
    resolver: zodResolver(registerSchema),
    defaultValues: { email: params.get('email') ?? '' },
  });

  const onSubmit = handleSubmit(async (values) => {
    try {
      const auth = await api<AuthResponse>('/auth/register', { method: 'POST', body: values, noOrg: true });
      router.replace(await completeSignIn(auth, params.get('next')));
    } catch (error) {
      applyApiError(error, setError);
    }
  });

  return (
    <form onSubmit={onSubmit} className="grid gap-4" noValidate>
      <Field label="Full name" htmlFor="name" error={errors.name?.message}>
        <Input id="name" autoComplete="name" autoFocus aria-invalid={!!errors.name} {...register('name')} />
      </Field>
      <Field label="Work email" htmlFor="email" error={errors.email?.message}>
        <Input id="email" type="email" autoComplete="email" aria-invalid={!!errors.email} {...register('email')} />
      </Field>
      <Field
        label="Password"
        htmlFor="password"
        error={errors.password?.message}
        hint="At least 10 characters with upper and lower case letters and a number."
      >
        <Input id="password" type="password" autoComplete="new-password" aria-invalid={!!errors.password} {...register('password')} />
      </Field>
      <Button type="submit" loading={isSubmitting}>
        Create account
      </Button>
    </form>
  );
}

export default function RegisterPage() {
  return (
    <div className="grid gap-6">
      <div className="grid gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Create your account</h1>
        <p className="text-sm text-muted-foreground">Free to start. No card required.</p>
      </div>
      <Suspense>
        <RegisterForm />
      </Suspense>
      <p className="text-center text-sm text-muted-foreground">
        Already have an account?{' '}
        <Link href="/login" className="font-medium text-primary hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}
