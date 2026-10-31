import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { MemberStatus, Role } from '@ledgerloop/shared-types';
import type { UpdateMemberInput } from '@ledgerloop/validation';
import type { ClientSession, Model } from 'mongoose';
import { notFound, unprocessable } from '../../common/errors/app-exception';
import { TransactionRunner } from '../../database/transaction-runner';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { Organization } from './schemas/organization.schema';
import { Membership, type MembershipDocument } from './schemas/membership.schema';

@Injectable()
export class MembershipsService {
  constructor(
    @InjectModel(Membership.name) private readonly memberships: Model<Membership>,
    @InjectModel(Organization.name) private readonly organizations: Model<Organization>,
    private readonly tx: TransactionRunner,
    private readonly audit: AuditLogsService,
  ) {}

  /** Active membership in an organization that is not suspended, or null. */
  async findActive(organizationId: string, userId: string): Promise<MembershipDocument | null> {
    const membership = await this.memberships
      .findOne({ organizationId, userId, status: MemberStatus.ACTIVE })
      .exec();
    if (!membership) return null;
    const live = await this.organizations.exists({ _id: organizationId, isSuspended: false });
    return live ? membership : null;
  }

  async add(
    organizationId: string,
    userId: string,
    role: Role,
    session?: ClientSession,
  ): Promise<MembershipDocument> {
    const [membership] = await this.memberships.create([{ organizationId, userId, role }], {
      session,
    });
    return membership!;
  }

  listForUser(userId: string) {
    return this.memberships
      .find({ userId, status: MemberStatus.ACTIVE })
      .populate('organizationId')
      .sort({ createdAt: 1 })
      .exec();
  }

  listForOrganization(organizationId: string) {
    return this.memberships
      .find({ organizationId })
      .populate('userId', 'name email emailVerifiedAt isActive')
      .sort({ createdAt: 1 })
      .exec();
  }

  async update(organizationId: string, memberId: string, input: UpdateMemberInput) {
    return this.tx.run(async (session) => {
      const membership = await this.getChangeable(organizationId, memberId, session);
      const before = membership.toJSON();
      if (input.role) membership.role = input.role;
      if (input.status) membership.status = input.status;
      await membership.save({ session });
      await this.audit.record(
        {
          organizationId,
          action: 'member.updated',
          entityType: 'Membership',
          entityId: membership._id,
          before,
          after: membership,
        },
        session,
      );
      return membership;
    });
  }

  async remove(organizationId: string, memberId: string): Promise<void> {
    await this.tx.run(async (session) => {
      const membership = await this.getChangeable(organizationId, memberId, session);
      await membership.deleteOne({ session });
      await this.audit.record(
        {
          organizationId,
          action: 'member.removed',
          entityType: 'Membership',
          entityId: membership._id,
          before: membership,
        },
        session,
      );
    });
  }

  private async getChangeable(organizationId: string, memberId: string, session: ClientSession) {
    const membership = await this.memberships
      .findOne({ _id: memberId, organizationId })
      .session(session)
      .exec();
    if (!membership) throw notFound('Member');
    if (membership.role === Role.OWNER) {
      throw unprocessable('OWNER_MEMBERSHIP_PROTECTED', 'The organization owner cannot be changed');
    }
    return membership;
  }
}
