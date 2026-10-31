import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { InvoiceStatus, PaymentStatus } from '@ledgerloop/shared-types';
import { Types, type Model } from 'mongoose';
import { BankTransaction } from '../bank-imports/schemas/bank-transaction.schema';
import { daysBetween, todayIn } from '../invoices/domain/invoice-status';
import { Invoice } from '../invoices/invoice.schema';
import { OrganizationsService } from '../organizations/organizations.service';
import { Payment } from '../payments/schemas/payment.schema';
import {
  ReconciliationException,
  ReconciliationMatch,
} from '../reconciliation/schemas/reconciliation.schemas';
import { AGING_BUCKETS, agingBucket, lastMonths, type AgingBucket } from './domain/buckets';

const POSTED_INVOICE = { $nin: [InvoiceStatus.DRAFT, InvoiceStatus.VOID] };

export interface Period {
  from?: string;
  to?: string;
}

/**
 * Read-only reporting. All figures are scoped to one organization and use its
 * timezone for "today" and its currency for amounts (minor units).
 */
@Injectable()
export class AnalyticsService {
  constructor(
    @InjectModel(Invoice.name) private readonly invoices: Model<Invoice>,
    @InjectModel(Payment.name) private readonly payments: Model<Payment>,
    @InjectModel(BankTransaction.name) private readonly transactions: Model<BankTransaction>,
    @InjectModel(ReconciliationMatch.name) private readonly matches: Model<ReconciliationMatch>,
    @InjectModel(ReconciliationException.name)
    private readonly exceptions: Model<ReconciliationException>,
    private readonly organizations: OrganizationsService,
  ) {}

  async dashboard(organizationId: string, period: Period) {
    const org = await this.context(organizationId);
    const range = (field: string) =>
      period.from || period.to
        ? {
            [field]: {
              ...(period.from && { $gte: period.from }),
              ...(period.to && { $lte: period.to }),
            },
          }
        : {};

    const [invoiced] = await this.invoices.aggregate<{ total: number; allocated: number }>([
      { $match: { organizationId: org.id, status: POSTED_INVOICE, ...range('issueDate') } },
      {
        $group: {
          _id: null,
          total: { $sum: '$totalMinor' },
          allocated: { $sum: '$allocatedMinor' },
        },
      },
    ]);
    const [received] = await this.payments.aggregate<{ total: number }>([
      { $match: { organizationId: org.id, status: PaymentStatus.POSTED, ...range('paymentDate') } },
      { $group: { _id: null, total: { $sum: '$amountMinor' } } },
    ]);
    const [open] = await this.invoices.aggregate<{
      outstanding: number;
      overdue: number;
      partial: number;
      overdueCount: number;
    }>([
      { $match: { organizationId: org.id, status: POSTED_INVOICE } },
      { $set: { owed: { $subtract: ['$totalMinor', '$allocatedMinor'] } } },
      {
        $group: {
          _id: null,
          outstanding: { $sum: '$owed' },
          overdue: { $sum: { $cond: [{ $lt: ['$dueDate', org.today] }, '$owed', 0] } },
          overdueCount: {
            $sum: {
              $cond: [{ $and: [{ $lt: ['$dueDate', org.today] }, { $gt: ['$owed', 0] }] }, 1, 0],
            },
          },
          partial: {
            $sum: {
              $cond: [{ $and: [{ $gt: ['$allocatedMinor', 0] }, { $gt: ['$owed', 0] }] }, 1, 0],
            },
          },
        },
      },
    ]);
    const unmatched = await this.exceptions.countDocuments({
      organizationId: org.id,
      status: 'OPEN',
    });

    const invoicedTotal = invoiced?.total ?? 0;
    return {
      currency: org.currency,
      asOf: org.today,
      totalInvoicedMinor: invoicedTotal,
      totalReceivedMinor: received?.total ?? 0,
      totalOutstandingMinor: open?.outstanding ?? 0,
      overdueMinor: open?.overdue ?? 0,
      overdueInvoices: open?.overdueCount ?? 0,
      partiallyPaidInvoices: open?.partial ?? 0,
      unmatchedTransactions: unmatched,
      /** Share of invoiced value in the period that has been collected, in basis points. */
      collectionRateBps: invoicedTotal
        ? Math.round(((invoiced?.allocated ?? 0) / invoicedTotal) * 10_000)
        : 0,
    };
  }

  /** Monthly invoiced vs received, plus what is still outstanding from each month's invoices. */
  async collections(organizationId: string, months = 12) {
    const org = await this.context(organizationId);
    const series = lastMonths(org.today, months);
    const since = `${series[0]}-01`;

    const invoiced = await this.invoices.aggregate<{
      _id: string;
      total: number;
      outstanding: number;
    }>([
      { $match: { organizationId: org.id, status: POSTED_INVOICE, issueDate: { $gte: since } } },
      {
        $group: {
          _id: { $substrBytes: ['$issueDate', 0, 7] },
          total: { $sum: '$totalMinor' },
          outstanding: { $sum: { $subtract: ['$totalMinor', '$allocatedMinor'] } },
        },
      },
    ]);
    const received = await this.payments.aggregate<{ _id: string; total: number }>([
      {
        $match: {
          organizationId: org.id,
          status: PaymentStatus.POSTED,
          paymentDate: { $gte: since },
        },
      },
      {
        $group: { _id: { $substrBytes: ['$paymentDate', 0, 7] }, total: { $sum: '$amountMinor' } },
      },
    ]);
    const inv = new Map(invoiced.map((r) => [r._id, r]));
    const rec = new Map(received.map((r) => [r._id, r.total]));
    return series.map((month) => ({
      month,
      invoicedMinor: inv.get(month)?.total ?? 0,
      receivedMinor: rec.get(month) ?? 0,
      outstandingMinor: inv.get(month)?.outstanding ?? 0,
    }));
  }

  async aging(organizationId: string) {
    const org = await this.context(organizationId);
    const rows = await this.invoices
      .find({
        organizationId: org.id,
        status: POSTED_INVOICE,
        $expr: { $lt: ['$allocatedMinor', '$totalMinor'] },
      })
      .select('dueDate totalMinor allocatedMinor')
      .lean()
      .exec();
    const buckets = Object.fromEntries(
      AGING_BUCKETS.map((b) => [b, { bucket: b, amountMinor: 0, invoices: 0 }]),
    ) as Record<AgingBucket, { bucket: AgingBucket; amountMinor: number; invoices: number }>;
    for (const row of rows) {
      const bucket = buckets[agingBucket(daysBetween(row.dueDate, org.today))];
      bucket.amountMinor += row.totalMinor - row.allocatedMinor;
      bucket.invoices += 1;
    }
    return { asOf: org.today, buckets: AGING_BUCKETS.map((b) => buckets[b]) };
  }

  async topCustomers(organizationId: string, limit = 10) {
    const org = await this.context(organizationId);
    return this.invoices.aggregate([
      { $match: { organizationId: org.id, status: POSTED_INVOICE } },
      {
        $group: {
          _id: '$customerId',
          outstandingMinor: { $sum: { $subtract: ['$totalMinor', '$allocatedMinor'] } },
          overdueMinor: {
            $sum: {
              $cond: [
                { $lt: ['$dueDate', org.today] },
                { $subtract: ['$totalMinor', '$allocatedMinor'] },
                0,
              ],
            },
          },
          invoicedMinor: { $sum: '$totalMinor' },
          openInvoices: { $sum: { $cond: [{ $lt: ['$allocatedMinor', '$totalMinor'] }, 1, 0] } },
        },
      },
      { $match: { outstandingMinor: { $gt: 0 } } },
      { $sort: { outstandingMinor: -1 } },
      { $limit: limit },
      { $lookup: { from: 'customers', localField: '_id', foreignField: '_id', as: 'customer' } },
      {
        $project: {
          _id: 0,
          customerId: { $toString: '$_id' },
          name: { $first: '$customer.name' },
          outstandingMinor: 1,
          overdueMinor: 1,
          invoicedMinor: 1,
          openInvoices: 1,
        },
      },
    ]);
  }

  async reconciliation(organizationId: string) {
    const org = await this.context(organizationId);
    const byStatus = await this.transactions.aggregate<{
      _id: string;
      count: number;
      amount: number;
    }>([
      { $match: { organizationId: org.id, direction: 'CREDIT' } },
      { $group: { _id: '$status', count: { $sum: 1 }, amount: { $sum: '$amountMinor' } } },
    ]);
    const decisions = await this.matches.aggregate<{ _id: string; count: number }>([
      { $match: { organizationId: org.id, status: 'MATCHED' } },
      { $group: { _id: '$decision', count: { $sum: 1 } } },
    ]);
    const [resolution] = await this.exceptions.aggregate<{ avgMinutes: number; open: number }>([
      { $match: { organizationId: org.id } },
      {
        $group: {
          _id: null,
          avgMinutes: {
            $avg: {
              $cond: [
                { $eq: ['$status', 'RESOLVED'] },
                { $divide: [{ $subtract: ['$resolvedAt', '$openedAt'] }, 60_000] },
                null,
              ],
            },
          },
          open: { $sum: { $cond: [{ $eq: ['$status', 'OPEN'] }, 1, 0] } },
        },
      },
    ]);

    const counts = Object.fromEntries(byStatus.map((s) => [s._id, s.count]));
    const credits = byStatus.filter((s) => s._id !== 'IGNORED').reduce((n, s) => n + s.count, 0);
    const matched = counts.MATCHED ?? 0;
    return {
      creditTransactions: credits,
      matchedTransactions: matched,
      matchRateBps: credits ? Math.round((matched / credits) * 10_000) : 0,
      byStatus: byStatus.map((s) => ({ status: s._id, count: s.count, amountMinor: s.amount })),
      decisions: Object.fromEntries(decisions.map((d) => [d._id, d.count])),
      openExceptions: resolution?.open ?? 0,
      averageResolutionMinutes: resolution?.avgMinutes ? Math.round(resolution.avgMinutes) : null,
    };
  }

  private async context(organizationId: string) {
    const organization = await this.organizations.get(organizationId);
    return {
      id: new Types.ObjectId(organizationId),
      today: todayIn(organization.timezone),
      currency: organization.currency,
    };
  }
}
