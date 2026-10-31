'use client';

import { Permission } from '@ledgerloop/shared-types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ImageUp } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/feedback';
import { Field, Input, Textarea } from '@/components/ui/input';
import { api, blobUrl } from '@/lib/api';
import { applyApiError } from '@/lib/auth';
import { useCan } from '@/lib/hooks';
import type { Organization } from '@/lib/types';

export function OrganizationSettings({ organizationId }: { organizationId: string }) {
  const queryClient = useQueryClient();
  const canManage = useCan(Permission.ORGANIZATION_MANAGE);
  const key = ['organization', organizationId];
  const org = useQuery({
    queryKey: key,
    queryFn: () => api<Organization>(`/organizations/${organizationId}`, { noOrg: true }),
  });
  const [form, setForm] = useState({ name: '', email: '', phone: '', gstin: '', address: '' });
  const [logo, setLogo] = useState<string | null>(null);

  useEffect(() => {
    if (!org.data) return;
    const o = org.data;
    setForm({ name: o.name, email: o.email ?? '', phone: o.phone ?? '', gstin: o.gstin ?? '', address: o.address ?? '' });
    if (o.logoKey) void blobUrl(`/organizations/${organizationId}/logo`).then(setLogo);
  }, [org.data, organizationId]);

  const save = useMutation({
    mutationFn: () => api(`/organizations/${organizationId}`, { method: 'PATCH', body: form, noOrg: true }),
    onSuccess: () => {
      toast.success('Organization updated');
      void queryClient.invalidateQueries({ queryKey: key });
      void queryClient.invalidateQueries({ queryKey: ['memberships'] });
    },
    onError: (e) => applyApiError(e),
  });
  const upload = useMutation({
    mutationFn: (file: File) => {
      const body = new FormData();
      body.append('file', file);
      return api(`/organizations/${organizationId}/logo`, { method: 'POST', body, noOrg: true });
    },
    onSuccess: (_, file) => {
      setLogo(URL.createObjectURL(file));
      toast.success('Logo updated. It will appear on new invoice PDFs.');
    },
    onError: (e) => applyApiError(e),
  });

  if (org.isPending) return <Skeleton className="h-80" />;
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <Card>
        <CardHeader>
          <CardTitle>Business details</CardTitle>
          <CardDescription>Printed on your invoices. Only the owner can change these.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <Field label="Business name" htmlFor="org-name">
            <Input id="org-name" disabled={!canManage} value={form.name} onChange={set('name')} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Billing email" htmlFor="org-email">
              <Input id="org-email" type="email" disabled={!canManage} value={form.email} onChange={set('email')} />
            </Field>
            <Field label="Phone" htmlFor="org-phone">
              <Input id="org-phone" disabled={!canManage} value={form.phone} onChange={set('phone')} />
            </Field>
            <Field label="GSTIN" htmlFor="org-gstin">
              <Input id="org-gstin" className="uppercase" disabled={!canManage} maxLength={15} value={form.gstin} onChange={set('gstin')} />
            </Field>
            <Field label="Currency · timezone" htmlFor="org-locale">
              <Input id="org-locale" disabled value={`${org.data?.currency} · ${org.data?.timezone}`} />
            </Field>
          </div>
          <Field label="Address" htmlFor="org-address">
            <Textarea id="org-address" rows={2} disabled={!canManage} value={form.address} onChange={set('address')} />
          </Field>
          {canManage && (
            <Button className="justify-self-start" loading={save.isPending} onClick={() => save.mutate()}>
              Save details
            </Button>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Logo</CardTitle>
          <CardDescription>PNG or JPEG, up to 2 MB.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="flex h-32 items-center justify-center rounded-lg border bg-muted/40">
            {logo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logo} alt="Organization logo" className="max-h-24 max-w-[80%] object-contain" />
            ) : (
              <span className="text-sm text-muted-foreground">No logo yet</span>
            )}
          </div>
          {canManage && (
            <label className="flex cursor-pointer items-center justify-center gap-2 rounded-md border px-3 py-2 text-sm font-medium hover:bg-muted">
              <ImageUp className="size-4" /> {upload.isPending ? 'Uploading…' : 'Upload logo'}
              <input
                type="file"
                accept="image/png,image/jpeg"
                className="sr-only"
                onChange={(e) => e.target.files?.[0] && upload.mutate(e.target.files[0])}
              />
            </label>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
