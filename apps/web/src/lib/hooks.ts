'use client';

import { hasPermission, type Permission, type Role } from '@ledgerloop/shared-types';
import { useQuery } from '@tanstack/react-query';
import { api } from './api';
import type { Membership } from './auth';
import { useSession } from './session';

export function useMemberships() {
  const accessToken = useSession((s) => s.accessToken);
  return useQuery({
    queryKey: ['memberships'],
    queryFn: () => api<Membership[]>('/organizations', { noOrg: true }),
    enabled: Boolean(accessToken),
    staleTime: 5 * 60_000,
  });
}

/** The membership for the organization currently selected in the switcher. */
export function useCurrentMembership(): Membership | undefined {
  const organizationId = useSession((s) => s.organizationId);
  const { data } = useMemberships();
  return data?.find((m) => m.organization.id === organizationId);
}

/** UI hint only: the API enforces every permission itself. */
export function useCan(permission: Permission): boolean {
  const membership = useCurrentMembership();
  return membership ? hasPermission(membership.role as Role, permission) : false;
}

export function useOrgQueryKey(...parts: unknown[]) {
  const organizationId = useSession((s) => s.organizationId);
  return [organizationId, ...parts];
}
