import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { CreateInvitationInput } from '@ledgerloop/validation';
import { Types, type Model } from 'mongoose';
import { AppException, conflict, forbidden, notFound } from '../../common/errors/app-exception';
import { randomToken, sha256 } from '../../common/utils/crypto';
import { AppConfig } from '../../config/app-config.service';
import { TransactionRunner } from '../../database/transaction-runner';
import { Mailer } from '../../mail/mailer';
import { invitationTemplate } from '../../mail/templates';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { UsersService } from '../users/users.service';
import { MembershipsService } from './memberships.service';
import { Invitation, type InvitationDocument } from './schemas/invitation.schema';
import { Membership } from './schemas/membership.schema';
import { Organization } from './schemas/organization.schema';

const INVITATION_TTL_DAYS = 7;

const invalidInvitation = () =>
  new AppException(
    HttpStatus.BAD_REQUEST,
    'INVALID_INVITATION',
    'This invitation is invalid, expired or already used',
  );

@Injectable()
export class InvitationsService {
  constructor(
    @InjectModel(Invitation.name) private readonly invitations: Model<Invitation>,
    @InjectModel(Organization.name) private readonly organizations: Model<Organization>,
    @InjectModel(Membership.name) private readonly membershipModel: Model<Membership>,
    private readonly memberships: MembershipsService,
    private readonly users: UsersService,
    private readonly mailer: Mailer,
    private readonly config: AppConfig,
    private readonly tx: TransactionRunner,
    private readonly audit: AuditLogsService,
  ) {}

  async create(organizationId: string, invitedBy: string, input: CreateInvitationInput) {
    const existingUser = await this.users.findByEmail(input.email);
    if (
      existingUser &&
      (await this.membershipModel.exists({ organizationId, userId: existingUser._id }))
    ) {
      throw conflict('ALREADY_MEMBER', 'This person is already a member');
    }

    // A new invitation replaces any pending one for the same email.
    await this.invitations.updateMany(
      { organizationId, email: input.email, acceptedAt: null, revokedAt: null },
      { revokedAt: new Date() },
    );

    const token = randomToken();
    const invitation = await this.invitations.create({
      organizationId: new Types.ObjectId(organizationId),
      email: input.email,
      role: input.role,
      tokenHash: sha256(token),
      invitedBy: new Types.ObjectId(invitedBy),
      expiresAt: new Date(Date.now() + INVITATION_TTL_DAYS * 86_400_000),
    });

    const [organization, inviter] = await Promise.all([
      this.organizations.findById(organizationId).exec(),
      this.users.getById(invitedBy),
    ]);
    const url = `${this.config.get('APP_URL')}/invitations/accept?token=${token}`;
    await this.mailer.send({
      to: input.email,
      ...invitationTemplate(organization!.name, inviter.name, input.role, url),
    });
    await this.audit.record({
      organizationId,
      action: 'invitation.created',
      entityType: 'Invitation',
      entityId: invitation._id,
      after: { email: invitation.email, role: invitation.role },
    });
    return invitation;
  }

  listPending(organizationId: string) {
    return this.invitations
      .find({
        organizationId,
        acceptedAt: null,
        revokedAt: null,
        expiresAt: { $gt: new Date() },
      })
      .select('-tokenHash')
      .populate('invitedBy', 'name email')
      .sort({ createdAt: -1 })
      .exec();
  }

  async revoke(organizationId: string, invitationId: string): Promise<void> {
    const result = await this.invitations.updateOne(
      { _id: invitationId, organizationId, acceptedAt: null, revokedAt: null },
      { revokedAt: new Date() },
    );
    if (result.matchedCount === 0) throw notFound('Invitation');
  }

  async preview(token: string) {
    const invitation = await this.findUsable(token);
    const [organization, inviter] = await Promise.all([
      this.organizations.findById(invitation.organizationId).exec(),
      this.users.findById(invitation.invitedBy.toString()),
    ]);
    return {
      organizationName: organization?.name ?? '',
      email: invitation.email,
      role: invitation.role,
      invitedBy: inviter?.name ?? '',
      expiresAt: invitation.expiresAt,
    };
  }

  /** Joins the caller to the organization; the invitation is single-use. */
  async accept(token: string, userId: string) {
    const user = await this.users.getById(userId);
    const invitation = await this.findUsable(token);
    if (invitation.email !== user.email) {
      throw forbidden(
        'INVITATION_EMAIL_MISMATCH',
        `This invitation was sent to ${invitation.email}. Sign in with that email to accept it.`,
      );
    }

    return this.tx.run(async (session) => {
      const claimed = await this.invitations
        .findOneAndUpdate(
          { _id: invitation._id, acceptedAt: null, revokedAt: null },
          { acceptedAt: new Date() },
          { session },
        )
        .exec();
      if (!claimed) throw invalidInvitation();

      const organizationId = invitation.organizationId.toString();
      if (await this.membershipModel.exists({ organizationId, userId }).session(session)) {
        throw conflict('ALREADY_MEMBER', 'You are already a member of this organization');
      }
      const membership = await this.memberships.add(
        organizationId,
        userId,
        invitation.role,
        session,
      );
      await this.audit.record(
        {
          organizationId,
          action: 'invitation.accepted',
          entityType: 'Membership',
          entityId: membership._id,
          after: membership,
        },
        session,
      );
      return { organizationId, role: membership.role };
    });
  }

  private async findUsable(token: string): Promise<InvitationDocument> {
    const invitation = await this.invitations
      .findOne({
        tokenHash: sha256(token),
        acceptedAt: null,
        revokedAt: null,
        expiresAt: { $gt: new Date() },
      })
      .exec();
    if (!invitation) throw invalidInvitation();
    return invitation;
  }
}
