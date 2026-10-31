import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { InvoiceStatus, PaymentStatus } from '@ledgerloop/shared-types';
import { Types, type Model } from 'mongoose';
import { CustomersService } from '../customers/customers.service';
import { Invoice } from '../invoices/invoice.schema';
import { Payment } from './schemas/payment.schema';

export interface CustomerSummary {
  totalInvoicedMinor: number;
  totalReceivedMinor: number;
  outstandingMinor: number;
  overdueMinor: number;
  unallocatedMinor: number;
  openInvoices: number;
  overdueInvoices: number;
  creditLimitMinor: number | null;
  availableCreditMinor: number | null;
}

@Injectable()
export class CustomerAccountsService {
  constructor(
    @InjectModel(Invoice.name) private readonly invoices: Model<Invoice>,
    @InjectModel(Payment.name) private readonly payments: Model<Payment>,
    private readonly customers: CustomersService,
  ) {}

  async summary(organizationId: string, customerId: string): Promise<CustomerSummary> {
    const customer = await this.customers.get(organizationId, customerId);
    const match = {
      organizationId: new Types.ObjectId(organizationId),
      customerId: customer._id,
    };

    const [invoiceTotals] = await this.invoices.aggregate<{
      invoiced: number;
      outstanding: number;
      overdue: number;
      open: number;
      overdueCount: number;
    }>([
      { $match: { ...match, status: { $nin: [InvoiceStatus.DRAFT, InvoiceStatus.VOID] } } },
      { $set: { outstanding: { $subtract: ['$totalMinor', '$allocatedMinor'] } } },
      {
        $group: {
          _id: null,
          invoiced: { $sum: '$totalMinor' },
          outstanding: { $sum: '$outstanding' },
          overdue: {
            $sum: { $cond: [{ $eq: ['$status', InvoiceStatus.OVERDUE] }, '$outstanding', 0] },
          },
          open: { $sum: { $cond: [{ $gt: ['$outstanding', 0] }, 1, 0] } },
          overdueCount: { $sum: { $cond: [{ $eq: ['$status', InvoiceStatus.OVERDUE] }, 1, 0] } },
        },
      },
    ]);
    const [paymentTotals] = await this.payments.aggregate<{
      received: number;
      unallocated: number;
    }>([
      { $match: { ...match, status: PaymentStatus.POSTED } },
      {
        $group: {
          _id: null,
          received: { $sum: '$amountMinor' },
          unallocated: { $sum: { $subtract: ['$amountMinor', '$allocatedMinor'] } },
        },
      },
    ]);

    const outstanding = invoiceTotals?.outstanding ?? 0;
    const limit = customer.creditLimitMinor ?? null;
    return {
      totalInvoicedMinor: invoiceTotals?.invoiced ?? 0,
      totalReceivedMinor: paymentTotals?.received ?? 0,
      outstandingMinor: outstanding,
      overdueMinor: invoiceTotals?.overdue ?? 0,
      unallocatedMinor: paymentTotals?.unallocated ?? 0,
      openInvoices: invoiceTotals?.open ?? 0,
      overdueInvoices: invoiceTotals?.overdueCount ?? 0,
      creditLimitMinor: limit,
      availableCreditMinor: limit === null ? null : Math.max(0, limit - outstanding),
    };
  }
}
