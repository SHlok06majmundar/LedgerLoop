import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Role } from '@ledgerloop/shared-types';
import type { CreateOrganizationInput, UpdateOrganizationInput } from '@ledgerloop/validation';
import { randomBytes } from 'node:crypto';
import type { Model } from 'mongoose';
import { notFound } from '../../common/errors/app-exception';
import { TransactionRunner } from '../../database/transaction-runner';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { MembershipsService } from './memberships.service';
import { Organization, type OrganizationDocument } from './schemas/organization.schema';

@Injectable()
export class OrganizationsService {
  constructor(
    @InjectModel(Organization.name) private readonly organizations: Model<Organization>,
    private readonly memberships: MembershipsService,
    private readonly tx: TransactionRunner,
    private readonly audit: AuditLogsService,
  ) {}

  /** Creates the organization with the caller as its owner, atomically. */
  async create(userId: string, input: CreateOrganizationInput): Promise<OrganizationDocument> {
    const slug = await this.uniqueSlug(input.name);
    return this.tx.run(async (session) => {
      const [organization] = await this.organizations.create(
        [{ ...input, slug, createdBy: userId }],
        { session },
      );
      await this.memberships.add(organization!.id as string, userId, Role.OWNER, session);
      await this.audit.record(
        {
          organizationId: organization!._id,
          action: 'organization.created',
          entityType: 'Organization',
          entityId: organization!._id,
          after: organization,
        },
        session,
      );
      return organization!;
    });
  }

  async get(organizationId: string): Promise<OrganizationDocument> {
    const organization = await this.organizations.findById(organizationId).exec();
    if (!organization) throw notFound('Organization');
    return organization;
  }

  async update(organizationId: string, input: UpdateOrganizationInput) {
    return this.tx.run(async (session) => {
      const organization = await this.organizations
        .findById(organizationId)
        .session(session)
        .exec();
      if (!organization) throw notFound('Organization');
      const before = organization.toJSON();
      organization.set(input);
      await organization.save({ session });
      await this.audit.record(
        {
          organizationId,
          action: 'organization.updated',
          entityType: 'Organization',
          entityId: organization._id,
          before,
          after: organization,
        },
        session,
      );
      return organization;
    });
  }

  private async uniqueSlug(name: string): Promise<string> {
    const base =
      name
        .toLowerCase()
        .normalize('NFKD')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 40) || 'org';
    if (!(await this.organizations.exists({ slug: base }))) return base;
    return `${base}-${randomBytes(3).toString('hex')}`;
  }
}
