import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { NotificationStatus, ReminderKind } from '@ledgerloop/shared-types';
import { SchemaTypes, Types, type HydratedDocument } from 'mongoose';

export const CommunicationKind = { INVOICE: 'INVOICE', ...ReminderKind } as const;
export type CommunicationKind = (typeof CommunicationKind)[keyof typeof CommunicationKind];

/** An email to a customer: invoice delivery, reminder or manual message. */
@Schema({ timestamps: true, collection: 'communications' })
export class Communication {
  @Prop({ type: SchemaTypes.ObjectId, required: true })
  organizationId!: Types.ObjectId;

  @Prop({ type: SchemaTypes.ObjectId, required: true, ref: 'Customer' })
  customerId!: Types.ObjectId;

  @Prop({ type: [SchemaTypes.ObjectId], ref: 'Invoice', default: [] })
  invoiceIds!: Types.ObjectId[];

  @Prop({ required: true, enum: Object.values(CommunicationKind) })
  kind!: CommunicationKind;

  @Prop({ required: true, lowercase: true })
  to!: string;

  @Prop({ required: true })
  subject!: string;

  /** Optional personal note added by the sender. */
  @Prop()
  message?: string;

  @Prop({
    required: true,
    enum: Object.values(NotificationStatus),
    default: NotificationStatus.SCHEDULED,
  })
  status!: NotificationStatus;

  @Prop({ required: true, default: () => new Date() })
  scheduledAt!: Date;

  @Prop({ type: Date, default: null }) sentAt!: Date | null;
  @Prop({ required: true, default: 0 }) attempts!: number;
  @Prop() lastError?: string;

  /** Identifies an automated reminder step so it is sent once (e.g. `<invoiceId>:OVERDUE:7`). */
  @Prop()
  reminderKey?: string;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'User' })
  createdBy?: Types.ObjectId;

  createdAt!: Date;
}

export type CommunicationDocument = HydratedDocument<Communication>;
export const CommunicationSchema = SchemaFactory.createForClass(Communication);
CommunicationSchema.index({ organizationId: 1, customerId: 1, createdAt: -1 });
CommunicationSchema.index({ organizationId: 1, invoiceIds: 1 });
CommunicationSchema.index({ organizationId: 1, status: 1 });
CommunicationSchema.index(
  { organizationId: 1, reminderKey: 1 },
  { unique: true, partialFilterExpression: { reminderKey: { $type: 'string' } } },
);
