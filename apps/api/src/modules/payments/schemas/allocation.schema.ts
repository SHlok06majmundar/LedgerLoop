import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { SchemaTypes, Types, type HydratedDocument } from 'mongoose';

export const AllocationStatus = { ACTIVE: 'ACTIVE', REVERSED: 'REVERSED' } as const;
export type AllocationStatus = (typeof AllocationStatus)[keyof typeof AllocationStatus];

/** Part of a payment applied to one invoice. Never edited except to mark it reversed. */
@Schema({ timestamps: true, collection: 'payment_allocations' })
export class Allocation {
  @Prop({ type: SchemaTypes.ObjectId, required: true })
  organizationId!: Types.ObjectId;

  @Prop({ type: SchemaTypes.ObjectId, required: true, ref: 'Payment' })
  paymentId!: Types.ObjectId;

  @Prop({ type: SchemaTypes.ObjectId, required: true, ref: 'Invoice' })
  invoiceId!: Types.ObjectId;

  @Prop({ required: true })
  amountMinor!: number;

  @Prop({ required: true, enum: Object.values(AllocationStatus), default: AllocationStatus.ACTIVE })
  status!: AllocationStatus;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'User' })
  allocatedBy?: Types.ObjectId;

  @Prop({ type: Date, default: null })
  reversedAt!: Date | null;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'Reversal', default: null })
  reversalId!: Types.ObjectId | null;

  @Prop()
  reversalReason?: string;

  createdAt!: Date;
}

export type AllocationDocument = HydratedDocument<Allocation>;
export const AllocationSchema = SchemaFactory.createForClass(Allocation);
AllocationSchema.index({ organizationId: 1, paymentId: 1 });
AllocationSchema.index({ organizationId: 1, invoiceId: 1 });
