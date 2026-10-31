'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { createOrganizationSchema } from '@ledgerloop/validation';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { AuthGate } from '@/components/app/auth-gate';
import { Logo } from '@/components/brand';
import { Button } from '@/components/ui/button';
import { Field, Input, NativeSelect } from '@/components/ui/input';
import { api } from '@/lib/api';
import { applyApiError } from '@/lib/auth';
import { useSession } from '@/lib/session';

type FormInput = z.input<typeof createOrganizationSchema>;

const TIMEZONES = ['Asia/Kolkata', 'Asia/Dubai', 'Asia/Singapore', 'Europe/London', 'America/New_York', 'UTC'];

function CreateOrganization() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const setOrganization = useSession((s) => s.setOrganization);
  const user = useSession((s) => s.user);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FormInput>({
    resolver: zodResolver(createOrganizationSchema),
    defaultValues: { currency: 'INR', timezone: 'Asia/Kolkata' },
  });

  const onSubmit = handleSubmit(async (values) => {
    try {
      const org = await api<{ id: string; name: string }>('/organizations', {
        method: 'POST',
        body: values,
        noOrg: true,
      });
      setOrganization(org.id);
      await queryClient.invalidateQueries({ queryKey: ['memberships'] });
      toast.success(`${org.name} is ready`);
      router.replace('/dashboard');
    } catch (error) {
      applyApiError(error, setError);
    }
  });

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-4 py-10">
      <Logo className="mb-10" />
      <div className="w-full max-w-md rounded-2xl border bg-card p-8 shadow-sm">
        <h1 className="text-2xl font-semibold tracking-tight">
          Set up your business{user ? `, ${user.name.split(' ')[0]}` : ''}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          You can invite your team and add more organizations later.
        </p>
        <form onSubmit={onSubmit} className="mt-6 grid gap-4" noValidate>
          <Field label="Business name" htmlFor="name" error={errors.name?.message}>
            <Input id="name" autoFocus placeholder="ABC Traders Pvt Ltd" {...register('name')} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Currency" htmlFor="currency" error={errors.currency?.message}>
              <NativeSelect id="currency" {...register('currency')}>
                <option value="INR">INR (₹)</option>
                <option value="USD">USD ($)</option>
                <option value="AED">AED</option>
                <option value="GBP">GBP (£)</option>
              </NativeSelect>
            </Field>
            <Field label="Timezone" htmlFor="timezone" error={errors.timezone?.message}>
              <NativeSelect id="timezone" {...register('timezone')}>
                {TIMEZONES.map((tz) => (
                  <option key={tz} value={tz}>
                    {tz}
                  </option>
                ))}
              </NativeSelect>
            </Field>
          </div>
          <Button type="submit" loading={isSubmitting} className="mt-2">
            Create organization
          </Button>
        </form>
      </div>
    </div>
  );
}

export default function OnboardingPage() {
  return (
    <AuthGate>
      <CreateOrganization />
    </AuthGate>
  );
}
