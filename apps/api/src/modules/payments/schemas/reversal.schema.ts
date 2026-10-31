import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { SchemaTypes, Types, type HydratedDocument } from 'mongoose';

export const ReversalKind = { ALLOCATION: 'ALLOCATION', PAYMENT: 'PAYMENT' } as const;
export type ReversalKind = (typeof ReversalKind)[keyof typeof ReversalKind];

/** Immutable record of a correction to posted money. */
@Schema({ timestamps: { createdAt: true, updatedAt: false }, collection: 'reversals' })
export class Reversal {
  @Prop({ type: SchemaTypes.ObjectId, required: true })
  organizationId!: Types.ObjectId;

  @Prop({ required: true, enum: Object.values(ReversalKind) })
  kind!: ReversalKind;

  @Prop({ type: SchemaTypes.ObjectId, required: true })
  paymentId!: Types.ObjectId;

  @Prop({ type: [SchemaTypes.ObjectId], default: [] })
  allocationIds!: Types.ObjectId[];

  /** Total allocation amount released back to the invoices. */
  @Prop({ required: true })
  amountMinor!: number;

  @Prop({ required: true })
  reason!: string;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'User' })
  createdBy?: Types.ObjectId;

  createdAt!: Date;
}

export type ReversalDocument = HydratedDocument<Reversal>;
export const ReversalSchema = SchemaFactory.createForClass(Reversal);
ReversalSchema.index({ organizationId: 1, paymentId: 1 });
