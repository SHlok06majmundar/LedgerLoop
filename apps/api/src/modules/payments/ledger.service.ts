import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { InvoiceStatus, PaymentStatus } from '@ledgerloop/shared-types';
import type { AllocationLine } from '@ledgerloop/validation';
import { Types, type ClientSession, type Model } from 'mongoose';
import { RequestContext } from '../../common/context/request-context';
import { notFound, unprocessable } from '../../common/errors/app-exception';
import { deriveStatus } from '../invoices/domain/invoice-status';
import { Invoice } from '../invoices/invoice.schema';
import { OPEN_STATUSES } from '../invoices/invoices.service';
import { Allocation, AllocationStatus, type AllocationDocument } from './schemas/allocation.schema';
import { Payment, type PaymentDocument } from './schemas/payment.schema';

/**
 * Moves money between payments and invoices. Every change is a conditional
 * `$inc` that refuses to push a cache past its total, so concurrent requests
 * cannot over-allocate (docs/adr/0004). Must run inside a transaction.
 */
@Injectable()
export class LedgerService {
  constructor(
    @InjectModel(Payment.name) private readonly payments: Model<Payment>,
    @InjectModel(Invoice.name) private readonly invoices: Model<Invoice>,
    @InjectModel(Allocation.name) private readonly allocations: Model<Allocation>,
  ) {}

  async allocate(
    organizationId: string,
    payment: PaymentDocument,
    lines: AllocationLine[],
    today: string,
    session: ClientSession,
  ): Promise<AllocationDocument[]> {
    if (payment.status === PaymentStatus.REVERSED) {
      throw unprocessable('PAYMENT_REVERSED', 'A reversed payment cannot be allocated');
    }
    const total = lines.reduce((sum, l) => sum + l.amountMinor, 0);

    const updatedPayment = await this.payments
      .findOneAndUpdate(
        {
          _id: payment._id,
          organizationId,
          status: PaymentStatus.POSTED,
          $expr: { $lte: [{ $add: ['$allocatedMinor', total] }, '$amountMinor'] },
        },
        { $inc: { allocatedMinor: total } },
        { new: true, session },
      )
      .exec();
    if (!updatedPayment) {
      throw unprocessable(
        'PAYMENT_OVER_ALLOCATED',
        "The allocations exceed the payment's unallocated amount",
        { requestedMinor: total, unallocatedMinor: payment.amountMinor - payment.allocatedMinor },
      );
    }

    const created: AllocationDocument[] = [];
    for (const line of lines) {
      await this.applyToInvoice(organizationId, payment, line, today, session);
      const [allocation] = await this.allocations.create(
        [
          {
            organizationId,
            paymentId: payment._id,
            invoiceId: line.invoiceId,
            amountMinor: line.amountMinor,
            allocatedBy: actor(),
          },
        ],
        { session },
      );
      created.push(allocation!);
    }
    payment.allocatedMinor = updatedPayment.allocatedMinor;
    return created;
  }

  /** Releases active allocations back to their invoices and payment. */
  async release(
    organizationId: string,
    allocations: AllocationDocument[],
    reversalId: Types.ObjectId,
    reason: string,
    today: string,
    session: ClientSession,
  ): Promise<number> {
    let released = 0;
    for (const allocation of allocations) {
      const marked = await this.allocations
        .updateOne(
          { _id: allocation._id, status: AllocationStatus.ACTIVE },
          {
            status: AllocationStatus.REVERSED,
            reversedAt: new Date(),
            reversalId,
            reversalReason: reason,
          },
          { session },
        )
        .exec();
      if (marked.modifiedCount === 0) continue;

      const invoice = await this.invoices
        .findOneAndUpdate(
          { _id: allocation.invoiceId, organizationId },
          { $inc: { allocatedMinor: -allocation.amountMinor } },
          { new: true, session },
        )
        .exec();
      if (invoice) await this.syncStatus(invoice, today, session);
      await this.payments
        .updateOne(
          { _id: allocation.paymentId, organizationId },
          { $inc: { allocatedMinor: -allocation.amountMinor } },
          { session },
        )
        .exec();
      released += allocation.amountMinor;
    }
    return released;
  }

  private async applyToInvoice(
    organizationId: string,
    payment: PaymentDocument,
    line: AllocationLine,
    today: string,
    session: ClientSession,
  ) {
    const invoice = await this.invoices
      .findOne({ _id: line.invoiceId, organizationId })
      .session(session)
      .exec();
    if (!invoice) throw notFound('Invoice');
    if (!invoice.customerId.equals(payment.customerId)) {
      throw unprocessable(
        'CUSTOMER_MISMATCH',
        `Invoice ${invoice.invoiceNumber} belongs to a different customer`,
      );
    }
    if (!OPEN_STATUSES.includes(invoice.status as (typeof OPEN_STATUSES)[number])) {
      throw unprocessable(
        'INVOICE_NOT_OPEN',
        `Invoice ${invoice.invoiceNumber} is ${invoice.status.toLowerCase()} and cannot receive payments`,
      );
    }

    const updated = await this.invoices
      .findOneAndUpdate(
        {
          _id: invoice._id,
          organizationId,
          status: { $in: OPEN_STATUSES },
          $expr: { $lte: [{ $add: ['$allocatedMinor', line.amountMinor] }, '$totalMinor'] },
        },
        { $inc: { allocatedMinor: line.amountMinor } },
        { new: true, session },
      )
      .exec();
    if (!updated) {
      throw unprocessable(
        'INVOICE_OVER_ALLOCATED',
        `Invoice ${invoice.invoiceNumber} has only ${invoice.totalMinor - invoice.allocatedMinor} outstanding`,
        {
          invoiceId: line.invoiceId,
          outstandingMinor: invoice.totalMinor - invoice.allocatedMinor,
        },
      );
    }
    await this.syncStatus(updated, today, session);
  }

  private async syncStatus(
    invoice: InstanceType<Model<Invoice>>,
    today: string,
    session: ClientSession,
  ) {
    if (invoice.status === InvoiceStatus.VOID || invoice.status === InvoiceStatus.DRAFT) return;
    const status = deriveStatus(invoice, today);
    const paidAt = status === InvoiceStatus.PAID ? new Date() : null;
    if (status !== invoice.status || (invoice.paidAt === null) !== (paidAt === null)) {
      await this.invoices.updateOne({ _id: invoice._id }, { status, paidAt }, { session }).exec();
    }
  }
}

function actor(): Types.ObjectId | undefined {
  const userId = RequestContext.get()?.userId;
  return userId ? new Types.ObjectId(userId) : undefined;
}
