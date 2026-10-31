import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { RunStatus } from '@ledgerloop/shared-types';
import { SchemaTypes, Types, type HydratedDocument } from 'mongoose';
import type { BlockCode, Signal } from '../domain/matching';

@Schema({ _id: false })
export class RunStats {
  @Prop({ default: 0 }) examined!: number;
  @Prop({ default: 0 }) matched!: number;
  @Prop({ default: 0 }) suggested!: number;
  @Prop({ default: 0 }) partial!: number;
  @Prop({ default: 0 }) discrepancy!: number;
  @Prop({ default: 0 }) unmatched!: number;
}
const RunStatsSchema = SchemaFactory.createForClass(RunStats);

/** One pass of the matching engine over unreconciled credits. */
@Schema({ timestamps: true, collection: 'reconciliation_runs' })
export class ReconciliationRun {
  @Prop({ type: SchemaTypes.ObjectId, required: true }) organizationId!: Types.ObjectId;
  @Prop({ required: true, enum: Object.values(RunStatus), default: RunStatus.RUNNING })
  status!: RunStatus;
  @Prop({ required: true, enum: ['MANUAL', 'IMPORT', 'SCHEDULED'] }) trigger!: string;
  @Prop({ type: SchemaTypes.ObjectId, ref: 'ImportJob' }) importJobId?: Types.ObjectId;
  @Prop({ type: RunStatsSchema, default: () => ({}) }) stats!: RunStats;
  @Prop({ type: SchemaTypes.ObjectId, ref: 'User' }) startedBy?: Types.ObjectId;
  @Prop({ type: Date, default: null }) startedAt!: Date | null;
  @Prop({ type: Date, default: null }) completedAt!: Date | null;
  @Prop() failureReason?: string;
  createdAt!: Date;
}
export type ReconciliationRunDocument = HydratedDocument<ReconciliationRun>;
export const ReconciliationRunSchema = SchemaFactory.createForClass(ReconciliationRun);
ReconciliationRunSchema.index({ organizationId: 1, createdAt: -1 });

export const MatchDecision = {
  AUTO: 'AUTO',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  MANUAL: 'MANUAL',
} as const;
export type MatchDecision = (typeof MatchDecision)[keyof typeof MatchDecision];

/** A proposed or decided link between a bank line and a payment or invoices, with its reasons. */
@Schema({ timestamps: true, collection: 'reconciliation_matches' })
export class ReconciliationMatch {
  @Prop({ type: SchemaTypes.ObjectId, required: true }) organizationId!: Types.ObjectId;
  @Prop({ type: SchemaTypes.ObjectId, ref: 'ReconciliationRun' }) runId?: Types.ObjectId;
  @Prop({ type: SchemaTypes.ObjectId, required: true, ref: 'BankTransaction' })
  bankTransactionId!: Types.ObjectId;

  @Prop({ required: true, enum: ['PAYMENT', 'INVOICE', 'INVOICE_GROUP'] }) kind!: string;
  /** Stable identity of the candidate, used to avoid re-suggesting rejected ones. */
  @Prop({ required: true }) candidateKey!: string;
  @Prop({ type: SchemaTypes.ObjectId, ref: 'Customer' }) customerId?: Types.ObjectId;
  @Prop({ type: SchemaTypes.ObjectId, ref: 'Payment', default: null })
  paymentId!: Types.ObjectId | null;
  @Prop({ type: [SchemaTypes.ObjectId], ref: 'Invoice', default: [] })
  invoiceIds!: Types.ObjectId[];
  /** Amount each invoice receives when the match is applied. */
  @Prop({ type: [Number], default: [] }) invoiceAmountsMinor!: number[];

  @Prop({ required: true }) score!: number;
  @Prop({ type: SchemaTypes.Mixed, default: [] }) signals!: Signal[];
  @Prop({ type: [String], default: [] }) blocks!: BlockCode[];
  @Prop({ default: false }) partial!: boolean;

  @Prop({
    required: true,
    enum: ['SUGGESTED', 'MATCHED', 'PARTIALLY_MATCHED', 'DISCREPANCY', 'REJECTED'],
  })
  status!: string;
  @Prop({ enum: Object.values(MatchDecision) }) decision?: MatchDecision;
  @Prop({ type: SchemaTypes.ObjectId, ref: 'User' }) decidedBy?: Types.ObjectId;
  @Prop({ type: Date, default: null }) decidedAt!: Date | null;
  @Prop() note?: string;
  createdAt!: Date;
}
export type ReconciliationMatchDocument = HydratedDocument<ReconciliationMatch>;
export const ReconciliationMatchSchema = SchemaFactory.createForClass(ReconciliationMatch);
ReconciliationMatchSchema.index({ organizationId: 1, status: 1, createdAt: -1 });
ReconciliationMatchSchema.index({ organizationId: 1, bankTransactionId: 1 });

@Schema({ _id: false, timestamps: { createdAt: true, updatedAt: false } })
export class ExceptionComment {
  @Prop({ type: SchemaTypes.ObjectId, ref: 'User', required: true }) userId!: Types.ObjectId;
  @Prop({ required: true }) body!: string;
  createdAt!: Date;
}
const ExceptionCommentSchema = SchemaFactory.createForClass(ExceptionComment);

/** A bank credit that needs a person to decide; one per bank transaction. */
@Schema({ timestamps: true, collection: 'reconciliation_exceptions' })
export class ReconciliationException {
  @Prop({ type: SchemaTypes.ObjectId, required: true }) organizationId!: Types.ObjectId;
  @Prop({ type: SchemaTypes.ObjectId, required: true, ref: 'BankTransaction' })
  bankTransactionId!: Types.ObjectId;
  @Prop({ required: true, enum: ['OPEN', 'RESOLVED'], default: 'OPEN' }) status!:
    'OPEN' | 'RESOLVED';
  @Prop({ required: true, enum: ['UNMATCHED', 'SUGGESTED', 'PARTIALLY_MATCHED', 'DISCREPANCY'] })
  reason!: string;
  @Prop({ type: SchemaTypes.ObjectId, ref: 'User', default: null })
  assigneeId!: Types.ObjectId | null;
  @Prop({ type: [ExceptionCommentSchema], default: [] }) comments!: ExceptionComment[];
  @Prop({ required: true, default: () => new Date() }) openedAt!: Date;
  @Prop({ type: Date, default: null }) resolvedAt!: Date | null;
  @Prop({ type: SchemaTypes.ObjectId, ref: 'User' }) resolvedBy?: Types.ObjectId;
  @Prop({ enum: ['MATCHED', 'IGNORED'] }) resolution?: 'MATCHED' | 'IGNORED';
  @Prop() resolutionNote?: string;
  createdAt!: Date;
}
export type ReconciliationExceptionDocument = HydratedDocument<ReconciliationException>;
export const ReconciliationExceptionSchema = SchemaFactory.createForClass(ReconciliationException);
ReconciliationExceptionSchema.virtual('resolutionMinutes').get(function (
  this: ReconciliationException,
) {
  return this.resolvedAt
    ? Math.round((this.resolvedAt.getTime() - this.openedAt.getTime()) / 60_000)
    : null;
});
ReconciliationExceptionSchema.index({ organizationId: 1, bankTransactionId: 1 }, { unique: true });
ReconciliationExceptionSchema.index({ organizationId: 1, status: 1, openedAt: -1 });
ReconciliationExceptionSchema.index({ organizationId: 1, assigneeId: 1, status: 1 });
