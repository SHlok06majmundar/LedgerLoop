import { hasPermission, type Permission, type Role } from '@ledgerloop/shared-types';
import { useQuery } from '@tanstack/react-query';
import { api } from './api';
import { useSession } from './session';
import type { Membership } from './types';

/** UI hint only: the API enforces every permission itself. */
export function useCan(permission: Permission): boolean {
  const organizationId = useSession((s) => s.organizationId);
  const { data } = useQuery({
    queryKey: ['memberships'],
    queryFn: () => api<Membership[]>('/organizations', { noOrg: true }),
    staleTime: 5 * 60_000,
  });
  const membership = data?.find((m) => m.organization.id === organizationId);
  return membership ? hasPermission(membership.role as Role, permission) : false;
}
