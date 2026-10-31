import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { InvoiceStatus, MemberStatus, PaymentStatus } from '@ledgerloop/shared-types';
import type { PaginationQuery } from '@ledgerloop/validation';
import { Types, type Model } from 'mongoose';
import { notFound, unprocessable } from '../../common/errors/app-exception';
import { escapeRegex } from '../../database/paginate';
import { Paginated } from '../../common/http/paginated';
import { SessionsService } from '../auth/sessions.service';
import { Invoice } from '../invoices/invoice.schema';
import { Membership } from '../organizations/schemas/membership.schema';
import { Organization } from '../organizations/schemas/organization.schema';
import { Payment } from '../payments/schemas/payment.schema';
import { User } from '../users/user.schema';
import { toPublicUser } from '../users/users.service';

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
  ) {}

  async stats() {
    const since = new Date(Date.now() - 30 * 86_400_000);
    const [organizations, suspended, users, activeUsers, newUsers, invoiceTotals, paymentTotals] =
      await Promise.all([
        this.organizations.countDocuments(),
        this.organizations.countDocuments({ isSuspended: true }),
        this.users.countDocuments(),
        this.users.countDocuments({ lastLoginAt: { $gte: since } }),
        this.users.countDocuments({ createdAt: { $gte: since } }),
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
    const filter = query.search ? { name: new RegExp(escapeRegex(query.search), 'i') } : {};
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

  async setOrganizationSuspended(organizationId: string, isSuspended: boolean) {
    const organization = await this.organizations
      .findByIdAndUpdate(organizationId, { isSuspended }, { new: true })
      .exec();
    if (!organization) throw notFound('Organization');
    return organization;
  }

  async listUsers(query: PaginationQuery) {
    const filter = query.search
      ? {
          $or: [
            { name: new RegExp(escapeRegex(query.search), 'i') },
            { email: new RegExp(escapeRegex(query.search), 'i') },
          ],
        }
      : {};
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
  async setUserActive(actorId: string, userId: string, isActive: boolean) {
    if (actorId === userId && !isActive) {
      throw unprocessable('CANNOT_DEACTIVATE_SELF', 'You cannot deactivate your own account');
    }
    const user = await this.users.findByIdAndUpdate(userId, { isActive }, { new: true }).exec();
    if (!user) throw notFound('User');
    if (!isActive) await this.sessions.revokeAll(userId);
    return toPublicUser(user);
  }
}
