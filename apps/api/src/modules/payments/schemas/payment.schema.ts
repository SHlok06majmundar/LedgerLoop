import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { PaymentMethod, PaymentStatus } from '@ledgerloop/shared-types';
import { SchemaTypes, Types, type HydratedDocument } from 'mongoose';

@Schema({ timestamps: true, collection: 'payments' })
export class Payment {
  @Prop({ type: SchemaTypes.ObjectId, required: true })
  organizationId!: Types.ObjectId;

  @Prop({ type: SchemaTypes.ObjectId, required: true, ref: 'Customer' })
  customerId!: Types.ObjectId;

  /** Internal receipt number, e.g. PAY-2026-0001. */
  @Prop({ required: true })
  paymentNumber!: string;

  @Prop({ required: true })
  amountMinor!: number;

  /** Cache of active allocations; see docs/adr/0004. */
  @Prop({ required: true, default: 0 })
  allocatedMinor!: number;

  @Prop({ required: true, enum: Object.values(PaymentMethod) })
  method!: PaymentMethod;

  /** External reference (UTR, cheque number); unique among posted payments. */
  @Prop({ uppercase: true, trim: true })
  reference?: string;

  /** Calendar date, YYYY-MM-DD. */
  @Prop({ required: true })
  paymentDate!: string;

  @Prop()
  notes?: string;

  @Prop({ required: true, enum: Object.values(PaymentStatus), default: PaymentStatus.POSTED })
  status!: PaymentStatus;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'BankTransaction', default: null })
  bankTransactionId!: Types.ObjectId | null;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'User' })
  recordedBy?: Types.ObjectId;

  @Prop({ type: Date, default: null })
  reversedAt!: Date | null;

  @Prop()
  reversalReason?: string;

  createdAt!: Date;
  updatedAt!: Date;
}

export type PaymentDocument = HydratedDocument<Payment>;
export const PaymentSchema = SchemaFactory.createForClass(Payment);
PaymentSchema.virtual('unallocatedMinor').get(function (this: Payment) {
  return this.status === PaymentStatus.REVERSED ? 0 : this.amountMinor - this.allocatedMinor;
});
PaymentSchema.index({ organizationId: 1, paymentNumber: 1 }, { unique: true });
PaymentSchema.index(
  { organizationId: 1, reference: 1 },
  {
    unique: true,
    partialFilterExpression: { reference: { $type: 'string' }, status: PaymentStatus.POSTED },
  },
);
PaymentSchema.index({ organizationId: 1, customerId: 1, paymentDate: -1 });
PaymentSchema.index({ organizationId: 1, paymentDate: -1 });
