import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { ReconciliationStatus } from '@ledgerloop/shared-types';
import { SchemaTypes, Types, type HydratedDocument } from 'mongoose';

/** One line from an imported bank statement. */
@Schema({ timestamps: true, collection: 'bank_transactions' })
export class BankTransaction {
  @Prop({ type: SchemaTypes.ObjectId, required: true })
  organizationId!: Types.ObjectId;

  @Prop({ type: SchemaTypes.ObjectId, required: true, ref: 'ImportJob' })
  importJobId!: Types.ObjectId;

  @Prop({ required: true }) rowNumber!: number;
  /** YYYY-MM-DD */
  @Prop({ required: true }) transactionDate!: string;
  @Prop({ required: true, default: '' }) description!: string;
  @Prop() reference?: string;
  @Prop({ required: true }) amountMinor!: number;
  @Prop({ required: true, enum: ['CREDIT', 'DEBIT'] }) direction!: 'CREDIT' | 'DEBIT';

  /** Hash identifying the statement line across imports (duplicate detection). */
  @Prop({ required: true }) fingerprint!: string;

  @Prop({
    required: true,
    enum: Object.values(ReconciliationStatus),
    default: ReconciliationStatus.UNMATCHED,
  })
  status!: ReconciliationStatus;

  /** Amount already applied through approved matches (partial matches can leave a remainder). */
  @Prop({ required: true, default: 0 }) matchedMinor!: number;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'Payment', default: null })
  paymentId!: Types.ObjectId | null;

  /** Candidates a person rejected for this line; never suggested again. */
  @Prop({ type: [String], default: [] })
  rejectedKeys!: string[];

  createdAt!: Date;
}

export type BankTransactionDocument = HydratedDocument<BankTransaction>;
export const BankTransactionSchema = SchemaFactory.createForClass(BankTransaction);
BankTransactionSchema.index({ organizationId: 1, fingerprint: 1 }, { unique: true });
BankTransactionSchema.index({ organizationId: 1, status: 1, transactionDate: -1 });
BankTransactionSchema.index({ organizationId: 1, importJobId: 1, rowNumber: 1 });
