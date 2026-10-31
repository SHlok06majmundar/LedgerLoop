'use client';

import { Permission } from '@ledgerloop/shared-types';
import { PageHeader } from '@/components/app/page-header';
import { AuditLog } from '@/components/settings/audit-log';
import { MembersSettings } from '@/components/settings/members-settings';
import { OrganizationSettings } from '@/components/settings/organization-settings';
import { ProfileSettings } from '@/components/settings/profile-settings';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useCan, useCurrentMembership } from '@/lib/hooks';

export default function SettingsPage() {
  const membership = useCurrentMembership();
  const canAudit = useCan(Permission.AUDIT_READ);
  const organizationId = membership?.organization.id;

  return (
    <>
      <PageHeader title="Settings" description="Your profile, your business and your team." />
      <Tabs defaultValue="profile">
        <TabsList>
          <TabsTrigger value="profile">Profile</TabsTrigger>
          <TabsTrigger value="organization">Organization</TabsTrigger>
          <TabsTrigger value="members">Members</TabsTrigger>
          {canAudit && <TabsTrigger value="audit">Audit log</TabsTrigger>}
        </TabsList>
        <TabsContent value="profile">
          <ProfileSettings />
        </TabsContent>
        <TabsContent value="organization">{organizationId && <OrganizationSettings organizationId={organizationId} />}</TabsContent>
        <TabsContent value="members">{organizationId && <MembersSettings organizationId={organizationId} />}</TabsContent>
        {canAudit && (
          <TabsContent value="audit">
            <AuditLog />
          </TabsContent>
        )}
      </Tabs>
    </>
  );
}
