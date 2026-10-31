import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { SchemaTypes, Types, type HydratedDocument } from 'mongoose';

/** Append-only record of a change to financial or access data. */
@Schema({ timestamps: { createdAt: true, updatedAt: false }, collection: 'audit_logs' })
export class AuditLog {
  @Prop({ type: SchemaTypes.ObjectId, required: true })
  organizationId!: Types.ObjectId;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'User', default: null })
  userId!: Types.ObjectId | null;

  /** Dotted verb, e.g. `invoice.issued`. */
  @Prop({ required: true })
  action!: string;

  @Prop({ required: true })
  entityType!: string;

  @Prop({ type: SchemaTypes.ObjectId, required: true })
  entityId!: Types.ObjectId;

  @Prop({ type: SchemaTypes.Mixed, default: null })
  before!: unknown;

  @Prop({ type: SchemaTypes.Mixed, default: null })
  after!: unknown;

  @Prop()
  requestId?: string;

  @Prop()
  ip?: string;

  createdAt!: Date;
}

export type AuditLogDocument = HydratedDocument<AuditLog>;
export const AuditLogSchema = SchemaFactory.createForClass(AuditLog);
AuditLogSchema.index({ organizationId: 1, createdAt: -1 });
AuditLogSchema.index({ organizationId: 1, entityType: 1, entityId: 1, createdAt: -1 });

for (const op of [
  'updateOne',
  'updateMany',
  'findOneAndUpdate',
  'deleteOne',
  'deleteMany',
  'findOneAndDelete',
  'replaceOne',
] as const) {
  AuditLogSchema.pre(op, function () {
    throw new Error('Audit logs are append-only');
  });
}
