import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { SchemaTypes, Types, type HydratedDocument } from 'mongoose';

/** In-app alert for one user (see Notification in CONTEXT.md). */
@Schema({ timestamps: { createdAt: true, updatedAt: false }, collection: 'notifications' })
export class Notification {
  @Prop({ type: SchemaTypes.ObjectId, required: true, ref: 'User' })
  userId!: Types.ObjectId;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'Organization' })
  organizationId?: Types.ObjectId;

  /** Dotted event name, e.g. `import.completed`. */
  @Prop({ required: true }) type!: string;
  @Prop({ required: true }) title!: string;
  @Prop() body?: string;
  /** Path inside the web app to open, e.g. `/reconciliation/exceptions`. */
  @Prop() link?: string;
  @Prop({ type: Date, default: null }) readAt!: Date | null;

  createdAt!: Date;
}

export type NotificationDocument = HydratedDocument<Notification>;
export const NotificationSchema = SchemaFactory.createForClass(Notification);
NotificationSchema.index({ userId: 1, readAt: 1, createdAt: -1 });
NotificationSchema.index({ createdAt: 1 }, { expireAfterSeconds: 90 * 24 * 3600 });
