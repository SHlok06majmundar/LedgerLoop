import { CanActivate, ExecutionContext, HttpStatus, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { hasPermission } from '@ledgerloop/shared-types';
import { Types } from 'mongoose';
import { MembershipsService } from '../../modules/organizations/memberships.service';
import { RequestContext } from '../context/request-context';
import type { AuthedRequest } from '../decorators/current-user.decorator';
import {
  ORG_ACCESS,
  type OrgAccessRule,
  type OrgRequest,
} from '../decorators/organization.decorator';
import { AppException, forbidden, notFound } from '../errors/app-exception';

/**
 * Resolves the caller's membership for routes marked @OrgAccessRequired.
 * Non-members get 404 so ids from other organizations reveal nothing.
 */
@Injectable()
export class OrganizationGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly memberships: MembershipsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const rule = this.reflector.getAllAndOverride<OrgAccessRule | undefined>(ORG_ACCESS, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!rule) return true;

    const request = context.switchToHttp().getRequest<OrgRequest & AuthedRequest>();
    const organizationId = rule.param
      ? (request.params[rule.param] as string | undefined)
      : request.header('x-organization-id');
    if (!organizationId) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        'ORGANIZATION_REQUIRED',
        'Select an organization (X-Organization-Id header)',
      );
    }
    if (!Types.ObjectId.isValid(organizationId) || !request.auth) throw notFound('Organization');

    const membership = await this.memberships.findActive(organizationId, request.auth.userId);
    if (!membership) throw notFound('Organization');
    if (rule.permission && !hasPermission(membership.role, rule.permission)) {
      throw forbidden('INSUFFICIENT_ROLE', 'Your role does not allow this action');
    }

    request.org = {
      organizationId,
      memberId: membership.id as string,
      role: membership.role,
    };
    RequestContext.set({ organizationId });
    return true;
  }
}
