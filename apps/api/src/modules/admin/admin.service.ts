import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { InvoiceStatus, MemberStatus, PaymentStatus, Role } from '@ledgerloop/shared-types';
import type { PaginationQuery } from '@ledgerloop/validation';
import { Types, type Model } from 'mongoose';
import { notFound, unprocessable } from '../../common/errors/app-exception';
import { escapeRegex } from '../../database/paginate';
import { Paginated } from '../../common/http/paginated';
import { TransactionRunner } from '../../database/transaction-runner';
import { SessionsService } from '../auth/sessions.service';
import { Invoice } from '../invoices/invoice.schema';
import { Membership } from '../organizations/schemas/membership.schema';
import { Organization } from '../organizations/schemas/organization.schema';
import { Payment } from '../payments/schemas/payment.schema';
import { User } from '../users/user.schema';
import { toPublicUser } from '../users/users.service';

/** Records a Super Admin has not deleted. */
const LIVE = { deletedAt: null };

/** Platform-wide administration across all organizations. */
@Injectable()
export class AdminService {
  constructor(
    @InjectModel(Organization.name) private readonly organizations: Model<Organization>,
    @InjectModel(Membership.name) private readonly memberships: Model<Membership>,
    @InjectModel(User.name) private readonly users: Model<User>,
    @InjectModel(Invoice.name) private readonly invoices: Model<Invoice>,
    @InjectModel(Payment.name) private readonly payments: Model<Payment>,
    private readonly sessions: SessionsService,
    private readonly tx: TransactionRunner,
  ) {}

  async stats() {
    const since = new Date(Date.now() - 30 * 86_400_000);
    const [organizations, suspended, users, activeUsers, newUsers, invoiceTotals, paymentTotals] =
      await Promise.all([
        this.organizations.countDocuments(LIVE),
        this.organizations.countDocuments({ ...LIVE, isSuspended: true }),
        this.users.countDocuments(LIVE),
        this.users.countDocuments({ ...LIVE, lastLoginAt: { $gte: since } }),
        this.users.countDocuments({ ...LIVE, createdAt: { $gte: since } }),
        this.invoices.aggregate<{ count: number; total: number }>([
          { $match: { status: { $nin: [InvoiceStatus.DRAFT, InvoiceStatus.VOID] } } },
          { $group: { _id: null, count: { $sum: 1 }, total: { $sum: '$totalMinor' } } },
        ]),
        this.payments.aggregate<{ count: number; total: number }>([
          { $match: { status: PaymentStatus.POSTED } },
          { $group: { _id: null, count: { $sum: 1 }, total: { $sum: '$amountMinor' } } },
        ]),
      ]);
    const signups = await this.users.aggregate<{ _id: string; count: number }>([
      { $match: { createdAt: { $gte: new Date(Date.now() - 180 * 86_400_000) } } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m', date: '$createdAt' } },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]);
    return {
      organizations,
      suspendedOrganizations: suspended,
      users,
      activeUsersLast30Days: activeUsers,
      newUsersLast30Days: newUsers,
      issuedInvoices: invoiceTotals[0]?.count ?? 0,
      issuedInvoiceValueMinor: invoiceTotals[0]?.total ?? 0,
      postedPayments: paymentTotals[0]?.count ?? 0,
      postedPaymentValueMinor: paymentTotals[0]?.total ?? 0,
      signupsByMonth: signups.map((s) => ({ month: s._id, count: s.count })),
    };
  }

  async listOrganizations(query: PaginationQuery) {
    const filter = query.search
      ? { ...LIVE, name: new RegExp(escapeRegex(query.search), 'i') }
      : LIVE;
    const [rows, total] = await Promise.all([
      this.organizations
        .aggregate([
          { $match: filter },
          { $sort: { createdAt: query.order === 'asc' ? 1 : -1 } },
          { $skip: (query.page - 1) * query.limit },
          { $limit: query.limit },
          {
            $lookup: {
              from: 'memberships',
              localField: '_id',
              foreignField: 'organizationId',
              as: 'members',
              pipeline: [{ $match: { status: MemberStatus.ACTIVE } }, { $project: { _id: 1 } }],
            },
          },
          {
            $lookup: {
              from: 'invoices',
              localField: '_id',
              foreignField: 'organizationId',
              as: 'invoiceStats',
              pipeline: [
                { $match: { status: { $nin: [InvoiceStatus.DRAFT, InvoiceStatus.VOID] } } },
                {
                  $group: {
                    _id: null,
                    count: { $sum: 1 },
                    outstanding: { $sum: { $subtract: ['$totalMinor', '$allocatedMinor'] } },
                  },
                },
              ],
            },
          },
          { $lookup: { from: 'users', localField: 'createdBy', foreignField: '_id', as: 'owner' } },
          {
            $project: {
              _id: 0,
              id: { $toString: '$_id' },
              name: 1,
              slug: 1,
              currency: 1,
              isSuspended: 1,
              createdAt: 1,
              members: { $size: '$members' },
              invoices: { $ifNull: [{ $first: '$invoiceStats.count' }, 0] },
              outstandingMinor: { $ifNull: [{ $first: '$invoiceStats.outstanding' }, 0] },
              owner: { name: { $first: '$owner.name' }, email: { $first: '$owner.email' } },
            },
          },
        ])
        .exec(),
      this.organizations.countDocuments(filter),
    ]);
    return new Paginated(rows, total, query.page, query.limit);
  }

  async updateOrganization(
    organizationId: string,
    input: { name?: string; isSuspended?: boolean },
  ) {
    const organization = await this.organizations
      .findOneAndUpdate({ _id: organizationId, ...LIVE }, input, { new: true })
      .exec();
    if (!organization) throw notFound('Organization');
    return organization;
  }

  /** Soft-deletes an organization: its data stays for the record, nobody can reach it. */
  async deleteOrganization(organizationId: string) {
    const organization = await this.organizations
      .findOneAndUpdate(
        { _id: organizationId, ...LIVE },
        { deletedAt: new Date(), isSuspended: true },
        { new: true },
      )
      .exec();
    if (!organization) throw notFound('Organization');
  }

  async listUsers(query: PaginationQuery) {
    const filter = query.search
      ? {
          $or: [
            { name: new RegExp(escapeRegex(query.search), 'i') },
            { email: new RegExp(escapeRegex(query.search), 'i') },
          ],
          ...LIVE,
        }
      : LIVE;
    const [users, total] = await Promise.all([
      this.users
        .find(filter)
        .sort({ createdAt: query.order === 'asc' ? 1 : -1 })
        .skip((query.page - 1) * query.limit)
        .limit(query.limit)
        .exec(),
      this.users.countDocuments(filter),
    ]);
    const counts = await this.memberships.aggregate<{ _id: Types.ObjectId; count: number }>([
      { $match: { userId: { $in: users.map((u) => u._id) }, status: MemberStatus.ACTIVE } },
      { $group: { _id: '$userId', count: { $sum: 1 } } },
    ]);
    const byUser = new Map(counts.map((c) => [c._id.toString(), c.count]));
    return new Paginated(
      users.map((u) => ({
        ...toPublicUser(u),
        lastLoginAt: u.lastLoginAt,
        organizations: byUser.get(u.id as string) ?? 0,
      })),
      total,
      query.page,
      query.limit,
    );
  }

  /** Deactivating a user ends all of their sessions at once. */
  async updateUser(
    actorId: string,
    userId: string,
    input: { name?: string; isActive?: boolean; isSuperAdmin?: boolean },
  ) {
    if (actorId === userId && input.isActive === false) {
      throw unprocessable('CANNOT_DEACTIVATE_SELF', 'You cannot deactivate your own account');
    }
    if (actorId === userId && input.isSuperAdmin === false) {
      throw unprocessable('CANNOT_DEMOTE_SELF', 'You cannot remove your own Super Admin access');
    }
    const user = await this.users
      .findOneAndUpdate({ _id: userId, ...LIVE }, input, { new: true })
      .exec();
    if (!user) throw notFound('User');
    if (input.isActive === false) await this.sessions.revokeAll(userId);
    return toPublicUser(user);
  }

  /**
   * Soft-deletes a user and the organizations only they belong to, and releases
   * their email. An owner of a team must hand it over or delete it first.
   */
  async deleteUser(actorId: string, userId: string) {
    if (actorId === userId) {
      throw unprocessable('CANNOT_DELETE_SELF', 'You cannot delete your own account');
    }
    await this.tx.run(async (session) => {
      const user = await this.users
        .findOne({ _id: userId, ...LIVE })
        .session(session)
        .exec();
      if (!user) throw notFound('User');
      const owned = await this.memberships
        .find({ userId: user._id, role: Role.OWNER, status: MemberStatus.ACTIVE })
        .session(session)
        .exec();
      const soloOrganizations: Types.ObjectId[] = [];
      for (const membership of owned) {
        const others = await this.memberships
          .countDocuments({
            organizationId: membership.organizationId,
            userId: { $ne: user._id },
            status: MemberStatus.ACTIVE,
          })
          .session(session);
        if (others > 0) {
          throw unprocessable(
            'USER_OWNS_TEAM',
            'This user owns an organization with other members; transfer or delete it first',
          );
        }
        soloOrganizations.push(membership.organizationId);
      }
      const now = new Date();
      await this.organizations.updateMany(
        { _id: { $in: soloOrganizations }, ...LIVE },
        { deletedAt: now, isSuspended: true },
        { session },
      );
      await this.memberships.updateMany(
        { userId: user._id },
        { status: MemberStatus.DISABLED },
        { session },
      );
      await this.users.updateOne(
        { _id: user._id },
        {
          deletedAt: now,
          isActive: false,
          isSuperAdmin: false,
          email: `deleted-${user.id as string}@deleted.ledgerloop.invalid`,
        },
        { session },
      );
    });
    await this.sessions.revokeAll(userId);
  }
}
