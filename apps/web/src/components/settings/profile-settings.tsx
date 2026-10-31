'use client';

import { useMutation } from '@tanstack/react-query';
import { useTheme } from 'next-themes';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, Input, NativeSelect } from '@/components/ui/input';
import { api } from '@/lib/api';
import { applyApiError } from '@/lib/auth';
import { useSession, type SessionUser } from '@/lib/session';

export function ProfileSettings() {
  const { user, setUser } = useSession();
  const { theme, setTheme } = useTheme();
  const [name, setName] = useState(user?.name ?? '');
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');

  const saveName = useMutation({
    mutationFn: () => api<SessionUser>('/auth/me', { method: 'PATCH', body: { name }, noOrg: true }),
    onSuccess: (u) => {
      setUser(u);
      toast.success('Profile updated');
    },
    onError: (e) => applyApiError(e),
  });
  const changePassword = useMutation({
    mutationFn: () =>
      api('/auth/change-password', { method: 'POST', body: { currentPassword: current, newPassword: next }, noOrg: true }),
    onSuccess: () => {
      setCurrent('');
      setNext('');
      toast.success('Password changed');
    },
    onError: (e) => applyApiError(e),
  });
  const resend = useMutation({
    mutationFn: () => api('/auth/resend-verification', { method: 'POST', noOrg: true }),
    onSuccess: () => toast.success('Verification email sent'),
    onError: (e) => applyApiError(e),
  });
  const logoutAll = useMutation({
    mutationFn: () => api('/auth/logout-all', { method: 'POST', noOrg: true }),
    onSuccess: () => {
      useSession.getState().clear();
      window.location.href = '/login';
    },
  });

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Your profile</CardTitle>
          <CardDescription>{user?.email}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          {!user?.emailVerified && (
            <div className="flex items-center justify-between gap-3 rounded-lg bg-warning-soft p-3 text-sm text-warning">
              Your email is not verified yet.
              <Button size="sm" variant="outline" loading={resend.isPending} onClick={() => resend.mutate()}>
                Resend link
              </Button>
            </div>
          )}
          <Field label="Name" htmlFor="profile-name">
            <Input id="profile-name" value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="Theme" htmlFor="profile-theme">
            <NativeSelect id="profile-theme" value={theme} onChange={(e) => setTheme(e.target.value)}>
              <option value="system">Match system</option>
              <option value="light">Light</option>
              <option value="dark">Dark</option>
            </NativeSelect>
          </Field>
          <Button className="justify-self-start" disabled={name.trim().length < 2} loading={saveName.isPending} onClick={() => saveName.mutate()}>
            Save profile
          </Button>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Security</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          <Field label="Current password" htmlFor="pw-current">
            <Input id="pw-current" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />
          </Field>
          <Field label="New password" htmlFor="pw-new" hint="At least 10 characters with upper and lower case letters and a number.">
            <Input id="pw-new" type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} />
          </Field>
          <div className="flex flex-wrap justify-between gap-2">
            <Button disabled={!current || next.length < 10} loading={changePassword.isPending} onClick={() => changePassword.mutate()}>
              Change password
            </Button>
            <Button variant="outline" loading={logoutAll.isPending} onClick={() => logoutAll.mutate()}>
              Sign out everywhere
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
