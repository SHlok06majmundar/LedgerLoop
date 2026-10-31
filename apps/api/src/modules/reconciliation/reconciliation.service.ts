import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { PaymentStatus, ReconciliationStatus, RunStatus } from '@ledgerloop/shared-types';
import type {
  ListExceptionsQuery,
  ListMatchesQuery,
  ManualMatchInput,
  UpdateExceptionInput,
} from '@ledgerloop/validation';
import { Types, type ClientSession, type FilterQuery, type Model } from 'mongoose';
import { RequestContext } from '../../common/context/request-context';
import { conflict, notFound, unprocessable } from '../../common/errors/app-exception';
import { paginate } from '../../database/paginate';
import { TransactionRunner } from '../../database/transaction-runner';
import { JobQueue } from '../../jobs/job-queue.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { RECONCILE_JOB } from '../bank-imports/bank-imports.service';
import {
  BankTransaction,
  type BankTransactionDocument,
} from '../bank-imports/schemas/bank-transaction.schema';
import { Customer } from '../customers/customer.schema';
import { Invoice } from '../invoices/invoice.schema';
import { MembershipsService } from '../organizations/memberships.service';
import { PaymentsService } from '../payments/payments.service';
import { Allocation } from '../payments/schemas/allocation.schema';
import { Payment } from '../payments/schemas/payment.schema';
import { CandidatePool } from './candidate-pool';
import { DEFAULT_POLICY, evaluate, type ScoredCandidate } from './domain/matching';
import {
  MatchDecision,
  ReconciliationException,
  ReconciliationMatch,
  ReconciliationRun,
  type ReconciliationMatchDocument,
} from './schemas/reconciliation.schemas';

const PENDING = ['SUGGESTED', 'PARTIALLY_MATCHED', 'DISCREPANCY'];
const RECONCILABLE = [
  ReconciliationStatus.UNMATCHED,
  ReconciliationStatus.SUGGESTED,
  ReconciliationStatus.PARTIALLY_MATCHED,
  ReconciliationStatus.DISCREPANCY,
];
const MAX_LINES_PER_RUN = 5000;

/** What applying a match does: which payment to link, or which invoices to pay and how much. */
interface MatchPlan {
  kind: string;
  customerId?: string;
  paymentId?: string | null;
  invoiceIds: string[];
  invoiceAmountsMinor: number[];
}

@Injectable()
export class ReconciliationService implements OnModuleInit {
  private readonly logger = new Logger(ReconciliationService.name);

  constructor(
    @InjectModel(ReconciliationRun.name) private readonly runs: Model<ReconciliationRun>,
    @InjectModel(ReconciliationMatch.name) private readonly matches: Model<ReconciliationMatch>,
    @InjectModel(ReconciliationException.name)
    private readonly exceptions: Model<ReconciliationException>,
    @InjectModel(BankTransaction.name) private readonly transactions: Model<BankTransaction>,
    @InjectModel(Payment.name) private readonly payments: Model<Payment>,
    @InjectModel(Invoice.name) private readonly invoices: Model<Invoice>,
    @InjectModel(Allocation.name) private readonly allocations: Model<Allocation>,
    @InjectModel(Customer.name) private readonly customers: Model<Customer>,
    private readonly paymentsService: PaymentsService,
    private readonly memberships: MembershipsService,
    private readonly queue: JobQueue,
    private readonly tx: TransactionRunner,
    private readonly audit: AuditLogsService,
  ) {}

  onModuleInit() {
    this.queue.register(RECONCILE_JOB, (payload) =>
      this.run(payload.organizationId as string, {
        runId: payload.runId as string | undefined,
        trigger: (payload.trigger as string) ?? 'MANUAL',
        importJobId: payload.importJobId as string | undefined,
      }),
    );
  }

  /** Queues a run; the worker executes it. */
  async start(organizationId: string) {
    const run = await this.runs.create({
      organizationId,
      trigger: 'MANUAL',
      status: RunStatus.RUNNING,
      startedBy: actor(),
    });
    await this.queue.enqueue(
      RECONCILE_JOB,
      { organizationId, runId: run.id as string, trigger: 'MANUAL' },
      { dedupeKey: `reconcile:${organizationId}` },
    );
    return run;
  }

  async run(
    organizationId: string,
    options: { runId?: string; trigger: string; importJobId?: string },
  ): Promise<void> {
    const run =
      (options.runId && (await this.runs.findById(options.runId).exec())) ||
      (await this.runs.create({
        organizationId,
        trigger: options.trigger,
        importJobId: options.importJobId,
        status: RunStatus.RUNNING,
      }));
    run.startedAt = new Date();
    await run.save();

    try {
      const pool = await CandidatePool.load(organizationId, {
        payments: this.payments,
        invoices: this.invoices,
        allocations: this.allocations,
        customers: this.customers,
      });
      const lines = await this.transactions
        .find({ organizationId, direction: 'CREDIT', status: { $in: RECONCILABLE } })
        .sort({ transactionDate: 1 })
        .limit(MAX_LINES_PER_RUN)
        .exec();
      const stats = {
        examined: 0,
        matched: 0,
        suggested: 0,
        partial: 0,
        discrepancy: 0,
        unmatched: 0,
      };

      for (const txn of lines) {
        stats.examined++;
        const outcome = await this.evaluateLine(organizationId, run._id, txn, pool);
        stats[outcome]++;
      }
      run.set({ status: RunStatus.COMPLETED, stats, completedAt: new Date() });
      await run.save();
    } catch (err) {
      this.logger.error(`Reconciliation run ${run.id as string} failed`, err as Error);
      run.set({
        status: RunStatus.FAILED,
        failureReason: (err as Error).message,
        completedAt: new Date(),
      });
      await run.save();
    }
  }

  private async evaluateLine(
    organizationId: string,
    runId: Types.ObjectId,
    txn: BankTransactionDocument,
    pool: CandidatePool,
  ): Promise<'matched' | 'suggested' | 'partial' | 'discrepancy' | 'unmatched'> {
    // Earlier undecided suggestions are replaced by this run's view.
    await this.matches.deleteMany({
      organizationId,
      bankTransactionId: txn._id,
      status: { $in: PENDING },
      decision: { $exists: false },
    });

    const line = {
      amountMinor: txn.amountMinor,
      transactionDate: txn.transactionDate,
      description: txn.description,
      reference: txn.reference,
    };
    const result = evaluate(line, pool.forLine(line, txn.rejectedKeys), DEFAULT_POLICY);
    const best = result.best;

    if (result.status === 'MATCHED' && best) {
      const plan = this.planFor(best, txn.amountMinor, pool);
      try {
        await this.tx.run(async (session) => {
          await this.apply(organizationId, txn._id, plan, session);
          await this.recordMatch(
            organizationId,
            runId,
            txn._id,
            best,
            plan,
            'MATCHED',
            MatchDecision.AUTO,
            session,
          );
        });
        pool.consume(best.candidate, plan.invoiceAmountsMinor);
        return 'matched';
      } catch (err) {
        this.logger.warn(
          `Auto-match for ${txn.id as string} fell back to review: ${(err as Error).message}`,
        );
        result.status = 'SUGGESTED';
      }
    }

    const reloaded = await this.transactions.findById(txn._id).exec();
    if (!reloaded) return 'unmatched';
    if (best && ['SUGGESTED', 'PARTIALLY_MATCHED', 'DISCREPANCY'].includes(result.status)) {
      const plan = this.planFor(best, txn.amountMinor, pool);
      await this.recordMatch(organizationId, runId, txn._id, best, plan, result.status, undefined);
      reloaded.status = result.status as ReconciliationStatus;
      await reloaded.save();
      await this.openException(organizationId, reloaded._id, result.status);
      return result.status === 'DISCREPANCY'
        ? 'discrepancy'
        : result.status === 'PARTIALLY_MATCHED'
          ? 'partial'
          : 'suggested';
    }
    reloaded.status = ReconciliationStatus.UNMATCHED;
    await reloaded.save();
    await this.openException(organizationId, reloaded._id, 'UNMATCHED');
    return 'unmatched';
  }

  async approve(organizationId: string, matchId: string) {
    const match = await this.getMatch(organizationId, matchId);
    if (!PENDING.includes(match.status) || match.decision) {
      throw unprocessable('MATCH_ALREADY_DECIDED', 'This match has already been decided');
    }
    await this.tx.run(async (session) => {
      await this.apply(
        organizationId,
        match.bankTransactionId,
        {
          kind: match.kind,
          customerId: match.customerId?.toString(),
          paymentId: match.paymentId?.toString(),
          invoiceIds: match.invoiceIds.map((i) => i.toString()),
          invoiceAmountsMinor: match.invoiceAmountsMinor,
        },
        session,
      );
      await this.matches.updateOne(
        { _id: match._id },
        {
          status: 'MATCHED',
          decision: MatchDecision.APPROVED,
          decidedBy: actor(),
          decidedAt: new Date(),
        },
        { session },
      );
    });
    return this.getMatch(organizationId, matchId);
  }

  async reject(organizationId: string, matchId: string, reason: string) {
    const match = await this.getMatch(organizationId, matchId);
    if (!PENDING.includes(match.status) || match.decision) {
      throw unprocessable('MATCH_ALREADY_DECIDED', 'This match has already been decided');
    }
    await this.tx.run(async (session) => {
      await this.matches.updateOne(
        { _id: match._id },
        {
          status: 'REJECTED',
          decision: MatchDecision.REJECTED,
          decidedBy: actor(),
          decidedAt: new Date(),
          note: reason,
        },
        { session },
      );
      await this.transactions.updateOne(
        { _id: match.bankTransactionId, organizationId },
        { status: ReconciliationStatus.UNMATCHED, $addToSet: { rejectedKeys: match.candidateKey } },
        { session },
      );
      await this.exceptions.updateOne(
        { organizationId, bankTransactionId: match.bankTransactionId, status: 'OPEN' },
        { reason: 'UNMATCHED' },
        { session },
      );
      await this.audit.record(
        {
          organizationId,
          action: 'reconciliation.rejected',
          entityType: 'BankTransaction',
          entityId: match.bankTransactionId,
          after: { matchId, candidate: match.candidateKey, reason },
        },
        session,
      );
    });
    return this.getMatch(organizationId, matchId);
  }

  /** A person links a bank line to a payment, or pays invoices from it. */
  async manualMatch(organizationId: string, bankTransactionId: string, input: ManualMatchInput) {
    const txn = await this.getTransaction(organizationId, bankTransactionId);
    let plan: MatchPlan;
    if (input.paymentId) {
      const payment = await this.payments.findOne({ _id: input.paymentId, organizationId }).exec();
      if (!payment) throw notFound('Payment');
      if (payment.amountMinor !== txn.amountMinor && !input.acceptDiscrepancy) {
        throw unprocessable(
          'AMOUNT_MISMATCH',
          'The payment amount differs from the bank line. Confirm to accept the discrepancy.',
          { paymentMinor: payment.amountMinor, bankMinor: txn.amountMinor },
        );
      }
      plan = {
        kind: 'PAYMENT',
        paymentId: input.paymentId,
        invoiceIds: [],
        invoiceAmountsMinor: [],
      };
    } else {
      const allocations = input.allocations ?? [];
      const total = allocations.reduce((s, a) => s + a.amountMinor, 0);
      if (total > txn.amountMinor) {
        throw unprocessable('PAYMENT_OVER_ALLOCATED', 'Allocations exceed the bank line amount');
      }
      plan = {
        kind: allocations.length > 1 ? 'INVOICE_GROUP' : 'INVOICE',
        customerId: input.customerId,
        invoiceIds: allocations.map((a) => a.invoiceId),
        invoiceAmountsMinor: allocations.map((a) => a.amountMinor),
      };
    }

    await this.tx.run(async (session) => {
      await this.apply(organizationId, txn._id, plan, session);
      await this.matches.updateMany(
        {
          organizationId,
          bankTransactionId: txn._id,
          status: { $in: PENDING },
          decision: { $exists: false },
        },
        {
          status: 'REJECTED',
          decision: MatchDecision.REJECTED,
          note: 'Superseded by a manual match',
          decidedAt: new Date(),
        },
        { session },
      );
      await this.matches.create(
        [
          {
            organizationId,
            bankTransactionId: txn._id,
            kind: plan.kind,
            candidateKey: plan.paymentId
              ? `payment:${plan.paymentId}`
              : `invoice:${plan.invoiceIds.sort().join('+')}`,
            customerId: plan.customerId,
            paymentId: plan.paymentId ?? null,
            invoiceIds: plan.invoiceIds,
            invoiceAmountsMinor: plan.invoiceAmountsMinor,
            score: 0,
            status: 'MATCHED',
            decision: MatchDecision.MANUAL,
            decidedBy: actor(),
            decidedAt: new Date(),
            note: input.note,
          },
        ],
        { session },
      );
    });
    return this.getTransaction(organizationId, bankTransactionId);
  }

  /** Links or creates the payment, marks the line matched and closes its exception. Needs a transaction. */
  private async apply(
    organizationId: string,
    bankTransactionId: Types.ObjectId,
    plan: MatchPlan,
    session: ClientSession,
  ): Promise<void> {
    const txn = await this.transactions
      .findOne({ _id: bankTransactionId, organizationId })
      .session(session)
      .exec();
    if (!txn) throw notFound('Bank transaction');
    if (txn.direction !== 'CREDIT' || !RECONCILABLE.includes(txn.status as never)) {
      throw conflict('ALREADY_RECONCILED', 'This bank line is already matched or ignored');
    }

    let paymentId: Types.ObjectId;
    if (plan.kind === 'PAYMENT') {
      const linked = await this.payments
        .findOneAndUpdate(
          {
            _id: plan.paymentId,
            organizationId,
            status: PaymentStatus.POSTED,
            bankTransactionId: null,
          },
          { bankTransactionId: txn._id },
          { session, new: true },
        )
        .exec();
      if (!linked) {
        throw conflict(
          'PAYMENT_ALREADY_RECONCILED',
          'This payment is already linked to a bank line',
        );
      }
      paymentId = linked._id;
    } else {
      const payment = await this.paymentsService.create(
        organizationId,
        {
          customerId: plan.customerId!,
          amountMinor: txn.amountMinor,
          method: 'BANK_TRANSFER',
          reference: txn.reference?.toUpperCase(),
          paymentDate: txn.transactionDate,
          notes: `Matched from bank statement: ${txn.description}`.slice(0, 2000),
          allocations: plan.invoiceIds.map((invoiceId, i) => ({
            invoiceId,
            amountMinor: plan.invoiceAmountsMinor[i]!,
          })),
        },
        { bankTransactionId: txn.id as string, session },
      );
      paymentId = (payment as { _id: Types.ObjectId })._id;
    }

    txn.set({ status: ReconciliationStatus.MATCHED, paymentId, matchedMinor: txn.amountMinor });
    await txn.save({ session });
    await this.exceptions.updateOne(
      { organizationId, bankTransactionId: txn._id, status: 'OPEN' },
      { status: 'RESOLVED', resolution: 'MATCHED', resolvedAt: new Date(), resolvedBy: actor() },
      { session },
    );
    await this.audit.record(
      {
        organizationId,
        action: 'reconciliation.matched',
        entityType: 'BankTransaction',
        entityId: txn._id,
        after: { paymentId: paymentId.toString(), kind: plan.kind, invoiceIds: plan.invoiceIds },
      },
      session,
    );
  }

  private planFor(best: ScoredCandidate, amountMinor: number, pool: CandidatePool): MatchPlan {
    const c = best.candidate;
    if (c.kind === 'PAYMENT') {
      return {
        kind: c.kind,
        paymentId: c.key.replace('payment:', ''),
        invoiceIds: [],
        invoiceAmountsMinor: [],
      };
    }
    const outstanding = pool.outstandingOf(c);
    return {
      kind: c.kind,
      customerId: c.customerId,
      invoiceIds: c.invoiceIds ?? [],
      invoiceAmountsMinor:
        c.kind === 'INVOICE' ? [Math.min(amountMinor, outstanding[0] ?? amountMinor)] : outstanding,
    };
  }

  private async recordMatch(
    organizationId: string,
    runId: Types.ObjectId,
    bankTransactionId: Types.ObjectId,
    best: ScoredCandidate,
    plan: MatchPlan,
    status: string,
    decision: MatchDecision | undefined,
    session?: ClientSession,
  ) {
    await this.matches.create(
      [
        {
          organizationId,
          runId,
          bankTransactionId,
          kind: best.candidate.kind,
          candidateKey: best.candidate.key,
          customerId: best.candidate.customerId,
          paymentId: plan.paymentId ?? null,
          invoiceIds: plan.invoiceIds,
          invoiceAmountsMinor: plan.invoiceAmountsMinor,
          score: best.score,
          signals: best.signals,
          blocks: best.blocks,
          partial: best.partial,
          status,
          ...(decision && { decision, decidedAt: new Date() }),
        },
      ],
      { session },
    );
  }

  private async openException(
    organizationId: string,
    bankTransactionId: Types.ObjectId,
    reason: string,
  ) {
    await this.exceptions.updateOne(
      { organizationId, bankTransactionId },
      [
        {
          $set: {
            reason,
            status: 'OPEN',
            openedAt: { $cond: [{ $eq: ['$status', 'OPEN'] }, '$openedAt', '$$NOW'] },
            resolvedAt: null,
            resolution: '$$REMOVE',
            comments: { $ifNull: ['$comments', []] },
            assigneeId: { $ifNull: ['$assigneeId', null] },
            createdAt: { $ifNull: ['$createdAt', '$$NOW'] },
            updatedAt: '$$NOW',
          },
        },
      ],
      { upsert: true },
    );
  }

  // Queries and exception handling

  listRuns(organizationId: string, query: { page: number; limit: number; order: 'asc' | 'desc' }) {
    return paginate(this.runs, { organizationId }, query, { defaultSort: 'createdAt' });
  }

  async getRun(organizationId: string, runId: string) {
    const run = await this.runs.findOne({ _id: runId, organizationId }).exec();
    if (!run) throw notFound('Reconciliation run');
    return run;
  }

  listMatches(organizationId: string, query: ListMatchesQuery) {
    const filter: FilterQuery<ReconciliationMatch> = { organizationId };
    if (query.status) filter.status = query.status;
    if (query.runId) filter.runId = query.runId;
    if (query.bankTransactionId) filter.bankTransactionId = query.bankTransactionId;
    return paginate(this.matches, filter, query, {
      sortable: ['score', 'createdAt'],
      defaultSort: 'createdAt',
      populate: [
        {
          path: 'bankTransactionId',
          select: 'transactionDate description reference amountMinor status',
        },
        { path: 'customerId', select: 'name' },
        { path: 'invoiceIds', select: 'invoiceNumber totalMinor allocatedMinor dueDate status' },
        { path: 'paymentId', select: 'paymentNumber reference amountMinor paymentDate' },
      ],
    });
  }

  async getMatch(organizationId: string, matchId: string): Promise<ReconciliationMatchDocument> {
    const match = await this.matches.findOne({ _id: matchId, organizationId }).exec();
    if (!match) throw notFound('Match');
    return match;
  }

  listExceptions(organizationId: string, query: ListExceptionsQuery) {
    const filter: FilterQuery<ReconciliationException> = { organizationId, status: query.status };
    if (query.assigneeId) filter.assigneeId = query.assigneeId;
    if (query.reason) filter.reason = query.reason;
    return paginate(this.exceptions, filter, query, {
      defaultSort: 'openedAt',
      populate: [
        {
          path: 'bankTransactionId',
          select: 'transactionDate description reference amountMinor status',
        },
        { path: 'assigneeId', select: 'name email' },
        { path: 'comments.userId', select: 'name' },
      ],
    });
  }

  async updateException(organizationId: string, exceptionId: string, input: UpdateExceptionInput) {
    const exception = await this.exceptions.findOne({ _id: exceptionId, organizationId }).exec();
    if (!exception) throw notFound('Exception');
    if (input.assigneeId !== undefined) {
      if (
        input.assigneeId &&
        !(await this.memberships.findActive(organizationId, input.assigneeId))
      ) {
        throw unprocessable(
          'ASSIGNEE_NOT_MEMBER',
          'Assign the exception to a member of this organization',
        );
      }
      exception.assigneeId = input.assigneeId ? new Types.ObjectId(input.assigneeId) : null;
    }
    if (input.comment) {
      exception.comments.push({ userId: actor()!, body: input.comment } as never);
    }
    await exception.save();
    await this.audit.record({
      organizationId,
      action: 'exception.updated',
      entityType: 'ReconciliationException',
      entityId: exception._id,
      after: input,
    });
    return exception;
  }

  async ignoreException(organizationId: string, exceptionId: string, reason: string) {
    const exception = await this.exceptions
      .findOne({ _id: exceptionId, organizationId, status: 'OPEN' })
      .exec();
    if (!exception) throw notFound('Exception');
    await this.tx.run(async (session) => {
      await this.transactions.updateOne(
        { _id: exception.bankTransactionId, organizationId },
        { status: ReconciliationStatus.IGNORED },
        { session },
      );
      await this.matches.updateMany(
        {
          organizationId,
          bankTransactionId: exception.bankTransactionId,
          status: { $in: PENDING },
        },
        {
          status: 'REJECTED',
          decision: MatchDecision.REJECTED,
          note: reason,
          decidedAt: new Date(),
        },
        { session },
      );
      await this.exceptions.updateOne(
        { _id: exception._id },
        {
          status: 'RESOLVED',
          resolution: 'IGNORED',
          resolutionNote: reason,
          resolvedAt: new Date(),
          resolvedBy: actor(),
        },
        { session },
      );
      await this.audit.record(
        {
          organizationId,
          action: 'exception.ignored',
          entityType: 'ReconciliationException',
          entityId: exception._id,
          after: { reason },
        },
        session,
      );
    });
    return this.exceptions.findById(exception._id).exec();
  }

  private async getTransaction(organizationId: string, id: string) {
    const txn = await this.transactions.findOne({ _id: id, organizationId }).exec();
    if (!txn) throw notFound('Bank transaction');
    return txn;
  }
}

function actor(): Types.ObjectId | undefined {
  const userId = RequestContext.get()?.userId;
  return userId ? new Types.ObjectId(userId) : undefined;
}
