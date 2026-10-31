import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Role } from '@ledgerloop/shared-types';
import type { CreateOrganizationInput, UpdateOrganizationInput } from '@ledgerloop/validation';
import { randomBytes } from 'node:crypto';
import type { Model } from 'mongoose';
import { notFound, unprocessable } from '../../common/errors/app-exception';
import { TransactionRunner } from '../../database/transaction-runner';
import { FileStorage, storageKeys } from '../../storage/file-storage';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { MembershipsService } from './memberships.service';
import { Organization, type OrganizationDocument } from './schemas/organization.schema';

const LOGO_TYPES: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg' };

@Injectable()
export class OrganizationsService {
  constructor(
    @InjectModel(Organization.name) private readonly organizations: Model<Organization>,
    private readonly memberships: MembershipsService,
    private readonly tx: TransactionRunner,
    private readonly audit: AuditLogsService,
    private readonly storage: FileStorage,
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

  /** Stores the logo printed on invoices; PNG or JPEG only (what the PDF renderer can embed). */
  async setLogo(organizationId: string, file: { buffer: Buffer; mimetype: string }) {
    const extension = LOGO_TYPES[file.mimetype];
    if (!extension) {
      throw unprocessable('UNSUPPORTED_IMAGE', 'Upload a PNG or JPEG image');
    }
    const organization = await this.get(organizationId);
    const key = storageKeys.logo(organizationId, extension);
    if (organization.logoKey && organization.logoKey !== key) {
      await this.storage.delete(organization.logoKey);
    }
    await this.storage.put(key, file.buffer, file.mimetype);
    organization.logoKey = key;
    await organization.save();
    await this.audit.record({
      organizationId,
      action: 'organization.logo_updated',
      entityType: 'Organization',
      entityId: organization._id,
    });
    return organization;
  }

  async getLogo(organizationId: string) {
    const organization = await this.get(organizationId);
    const file = organization.logoKey ? await this.storage.get(organization.logoKey) : null;
    if (!file) throw notFound('Logo');
    return file;
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
