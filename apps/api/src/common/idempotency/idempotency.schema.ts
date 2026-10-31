import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { SchemaTypes, type HydratedDocument } from 'mongoose';

@Schema({ collection: 'idempotency_keys', timestamps: { createdAt: true, updatedAt: false } })
export class IdempotencyRecord {
  /** Hash of caller, organization, route and client key. */
  @Prop({ required: true })
  _id!: string;

  @Prop({ required: true })
  requestHash!: string;

  @Prop({ required: true, enum: ['IN_PROGRESS', 'COMPLETED'] })
  state!: 'IN_PROGRESS' | 'COMPLETED';

  @Prop()
  statusCode?: number;

  @Prop({ type: SchemaTypes.Mixed })
  body?: unknown;

  @Prop({ required: true })
  expiresAt!: Date;
}

export type IdempotencyDocument = HydratedDocument<IdempotencyRecord>;
export const IdempotencySchema = SchemaFactory.createForClass(IdempotencyRecord);
IdempotencySchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
