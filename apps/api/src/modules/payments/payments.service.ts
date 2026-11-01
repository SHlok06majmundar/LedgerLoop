import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { PaymentStatus } from '@ledgerloop/shared-types';
import type {
  AllocationLine,
  CreatePaymentInput,
  ListPaymentsQuery,
  ReversePaymentInput,
  UpdatePaymentInput,
} from '@ledgerloop/validation';
import { mongo, Types, type ClientSession, type FilterQuery, type Model } from 'mongoose';
import { RequestContext } from '../../common/context/request-context';
import { conflict, notFound, unprocessable } from '../../common/errors/app-exception';
import { paginate } from '../../database/paginate';
import { SequenceService } from '../../database/sequence.service';
import { TransactionRunner } from '../../database/transaction-runner';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { CustomersService } from '../customers/customers.service';
import { todayIn } from '../invoices/domain/invoice-status';
import { OrganizationsService } from '../organizations/organizations.service';
import { LedgerService } from './ledger.service';
import { Allocation, AllocationStatus } from './schemas/allocation.schema';
import { Payment, type PaymentDocument } from './schemas/payment.schema';
import { Reversal, ReversalKind } from './schemas/reversal.schema';

@Injectable()
export class PaymentsService {
  constructor(
    @InjectModel(Payment.name) private readonly payments: Model<Payment>,
    @InjectModel(Allocation.name) private readonly allocations: Model<Allocation>,
    @InjectModel(Reversal.name) private readonly reversals: Model<Reversal>,
    private readonly ledger: LedgerService,
    private readonly customers: CustomersService,
    private readonly organizations: OrganizationsService,
    private readonly sequences: SequenceService,
    private readonly tx: TransactionRunner,
    private readonly audit: AuditLogsService,
  ) {}

  /** Records a payment and its optional allocations in one transaction. */
  async create(
    organizationId: string,
    input: CreatePaymentInput,
    options: { bankTransactionId?: string; session?: ClientSession } = {},
  ) {
    const today = await this.today(organizationId);
    const work = async (session: ClientSession) => {
      await this.customers.get(organizationId, input.customerId, session);
      if (input.reference) await this.assertReferenceFree(organizationId, input.reference, session);

      const year = input.paymentDate.slice(0, 4);
      const seq = await this.sequences.next(`payment:${organizationId}:${year}`, session);
      let payment: PaymentDocument;
      try {
        [payment] = (await this.payments.create(
          [
            {
              organizationId,
              customerId: input.customerId,
              paymentNumber: `PAY-${year}-${String(seq).padStart(4, '0')}`,
              amountMinor: input.amountMinor,
              method: input.method,
              reference: input.reference,
              paymentDate: input.paymentDate,
              notes: input.notes,
              bankTransactionId: options.bankTransactionId ?? null,
              recordedBy: actor(),
            },
          ],
          { session },
        )) as [PaymentDocument];
      } catch (err) {
        if (err instanceof mongo.MongoServerError && err.code === 11000 && input.reference) {
          throw duplicateReference(input.reference);
        }
        throw err;
      }

      if (input.allocations?.length) {
        await this.ledger.allocate(organizationId, payment, input.allocations, today, session);
      }
      await this.audit.record(
        {
          organizationId,
          action: 'payment.recorded',
          entityType: 'Payment',
          entityId: payment._id,
          after: { ...payment.toJSON(), allocations: input.allocations ?? [] },
        },
        session,
      );
      return payment;
    };

    const payment = options.session ? await work(options.session) : await this.tx.run(work);
    return options.session ? payment : this.getDetailed(organizationId, payment.id as string);
  }

  async allocate(organizationId: string, paymentId: string, lines: AllocationLine[]) {
    const today = await this.today(organizationId);
    await this.tx.run(async (session) => {
      const payment = await this.get(organizationId, paymentId, session);
      const created = await this.ledger.allocate(organizationId, payment, lines, today, session);
      for (const allocation of created) {
        await this.audit.record(
          {
            organizationId,
            action: 'payment.allocated',
            entityType: 'Payment',
            entityId: payment._id,
            after: allocation,
          },
          session,
        );
      }
    });
    return this.getDetailed(organizationId, paymentId);
  }

  /**
   * Corrects how a posted payment is described. Money (amount, customer) only
   * changes through a reversal, and a bank-matched payment keeps the bank's date.
   */
  async update(organizationId: string, paymentId: string, input: UpdatePaymentInput) {
    return this.tx.run(async (session) => {
      const payment = await this.get(organizationId, paymentId, session);
      if (payment.status === PaymentStatus.REVERSED) {
        throw unprocessable('PAYMENT_REVERSED', 'A reversed payment cannot be edited');
      }
      if (
        input.paymentDate &&
        payment.bankTransactionId &&
        input.paymentDate !== payment.paymentDate
      ) {
        throw unprocessable(
          'PAYMENT_FROM_BANK',
          'The date of a bank-matched payment comes from the statement',
        );
      }
      if (input.reference && input.reference !== payment.reference) {
        await this.assertReferenceFree(organizationId, input.reference, session);
      }
      const before = {
        method: payment.method,
        reference: payment.reference,
        paymentDate: payment.paymentDate,
        notes: payment.notes,
      };
      payment.set(input);
      await payment.save({ session });
      await this.audit.record(
        {
          organizationId,
          action: 'payment.updated',
          entityType: 'Payment',
          entityId: payment._id,
          before,
          after: input,
        },
        session,
      );
      return payment;
    });
  }

  /** Reverses one allocation, or the whole payment when no allocation is given. */
  async reverse(organizationId: string, paymentId: string, input: ReversePaymentInput) {
    const today = await this.today(organizationId);
    await this.tx.run(async (session) => {
      const payment = await this.get(organizationId, paymentId, session);
      if (payment.status === PaymentStatus.REVERSED) {
        throw unprocessable('PAYMENT_REVERSED', 'This payment is already reversed');
      }

      const filter: FilterQuery<Allocation> = {
        organizationId,
        paymentId: payment._id,
        status: AllocationStatus.ACTIVE,
      };
      if (input.allocationId) filter._id = input.allocationId;
      const targets = await this.allocations.find(filter).session(session).exec();
      if (input.allocationId && targets.length === 0) throw notFound('Allocation');

      const reversalId = new Types.ObjectId();
      const released = await this.ledger.release(
        organizationId,
        targets,
        reversalId,
        input.reason,
        today,
        session,
      );
      const kind = input.allocationId ? ReversalKind.ALLOCATION : ReversalKind.PAYMENT;
      await this.reversals.create(
        [
          {
            _id: reversalId,
            organizationId,
            kind,
            paymentId: payment._id,
            allocationIds: targets.map((a) => a._id),
            amountMinor: released,
            reason: input.reason,
            createdBy: actor(),
          },
        ],
        { session },
      );
      if (kind === ReversalKind.PAYMENT) {
        await this.payments
          .updateOne(
            { _id: payment._id },
            {
              status: PaymentStatus.REVERSED,
              reversedAt: new Date(),
              reversalReason: input.reason,
            },
            { session },
          )
          .exec();
      }
      await this.audit.record(
        {
          organizationId,
          action: kind === ReversalKind.PAYMENT ? 'payment.reversed' : 'allocation.reversed',
          entityType: 'Payment',
          entityId: payment._id,
          before: { allocatedMinor: payment.allocatedMinor, status: payment.status },
          after: {
            releasedMinor: released,
            reason: input.reason,
            allocationIds: targets.map((a) => a.id as string),
          },
        },
        session,
      );
    });
    return this.getDetailed(organizationId, paymentId);
  }

  list(organizationId: string, query: ListPaymentsQuery) {
    const filter: FilterQuery<Payment> = { organizationId };
    if (query.customerId) filter.customerId = query.customerId;
    if (query.method) filter.method = query.method;
    if (query.status) filter.status = query.status;
    if (query.from || query.to) {
      filter.paymentDate = {
        ...(query.from && { $gte: query.from }),
        ...(query.to && { $lte: query.to }),
      };
    }
    if (query.allocation === 'unallocated') filter.allocatedMinor = 0;
    if (query.allocation === 'full') filter.$expr = { $eq: ['$allocatedMinor', '$amountMinor'] };
    if (query.allocation === 'partial') {
      filter.allocatedMinor = { $gt: 0 };
      filter.$expr = { $lt: ['$allocatedMinor', '$amountMinor'] };
    }
    return paginate(this.payments, filter, query, {
      searchFields: ['paymentNumber', 'reference', 'notes'],
      sortable: ['paymentDate', 'amountMinor', 'createdAt'],
      defaultSort: 'paymentDate',
      populate: { path: 'customerId', select: 'name email' },
    });
  }

  async get(organizationId: string, paymentId: string, session?: ClientSession) {
    const payment = await this.payments
      .findOne({ _id: paymentId, organizationId })
      .session(session ?? null)
      .exec();
    if (!payment) throw notFound('Payment');
    return payment;
  }

  async getDetailed(organizationId: string, paymentId: string) {
    const payment = await this.get(organizationId, paymentId);
    await payment.populate({ path: 'customerId', select: 'name email' });
    const allocations = await this.allocations
      .find({ organizationId, paymentId: payment._id })
      .populate({
        path: 'invoiceId',
        select: 'invoiceNumber totalMinor allocatedMinor status dueDate',
      })
      .sort({ createdAt: 1 })
      .exec();
    return { ...payment.toJSON(), allocations: allocations.map((a) => a.toJSON()) };
  }

  async listAllocationsForInvoice(organizationId: string, invoiceId: string) {
    const allocations = await this.allocations
      .find({ organizationId, invoiceId })
      .populate({
        path: 'paymentId',
        select: 'paymentNumber reference method paymentDate amountMinor status',
      })
      .sort({ createdAt: 1 })
      .exec();
    return allocations.map((a) => {
      const { paymentId, ...rest } = a.toJSON() as Record<string, unknown>;
      return { ...rest, payment: paymentId };
    });
  }

  history(organizationId: string, paymentId: string) {
    return this.audit.list(organizationId, {
      page: 1,
      limit: 100,
      entityType: 'Payment',
      entityId: paymentId,
    });
  }

  private async assertReferenceFree(
    organizationId: string,
    reference: string,
    session: ClientSession,
  ) {
    const existing = await this.payments
      .findOne({ organizationId, reference, status: PaymentStatus.POSTED })
      .session(session)
      .select('paymentNumber')
      .exec();
    if (existing) throw duplicateReference(reference, existing.paymentNumber);
  }

  private async today(organizationId: string): Promise<string> {
    const organization = await this.organizations.get(organizationId);
    return todayIn(organization.timezone);
  }
}

function duplicateReference(reference: string, paymentNumber?: string) {
  return conflict(
    'DUPLICATE_PAYMENT_REFERENCE',
    `A payment with reference ${reference} is already recorded`,
    { reference, paymentNumber },
  );
}

function actor(): Types.ObjectId | undefined {
  const userId = RequestContext.get()?.userId;
  return userId ? new Types.ObjectId(userId) : undefined;
}
