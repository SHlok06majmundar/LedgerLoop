import { createParamDecorator, SetMetadata, type ExecutionContext } from '@nestjs/common';
import type { Permission, Role } from '@ledgerloop/shared-types';
import type { Request } from 'express';

export interface OrgAccess {
  organizationId: string;
  memberId: string;
  role: Role;
}

export type OrgRequest = Request & { org?: OrgAccess };

export const ORG_ACCESS = 'orgAccess';

export interface OrgAccessRule {
  /** Permission the caller's role must have; omit to require membership only. */
  permission?: Permission;
  /** Route param holding the organization id; defaults to the X-Organization-Id header. */
  param?: string;
}

/** Requires an active membership in the target organization (and optionally a permission). */
export const OrgAccessRequired = (rule: OrgAccessRule = {}) => SetMetadata(ORG_ACCESS, rule);

/** Shorthand for header-scoped routes guarded by one permission. */
export const RequirePermission = (permission: Permission) => OrgAccessRequired({ permission });

/** The organization membership resolved by the organization guard. */
export const CurrentOrg = createParamDecorator((_: unknown, ctx: ExecutionContext): OrgAccess => {
  const org = ctx.switchToHttp().getRequest<OrgRequest>().org;
  if (!org) throw new Error('CurrentOrg used on a route without @OrgAccessRequired');
  return org;
});
