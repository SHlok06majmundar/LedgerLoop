import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { SchemaTypes, Types, type HydratedDocument } from 'mongoose';

/**
 * One refresh token in a rotation family. Logging in starts a family;
 * each refresh revokes the current row and adds a new one to the family.
 */
@Schema({ timestamps: true, collection: 'sessions' })
export class Session {
  @Prop({ type: SchemaTypes.ObjectId, required: true, index: true })
  userId!: Types.ObjectId;

  @Prop({ required: true, index: true })
  familyId!: string;

  @Prop({ required: true, unique: true })
  tokenHash!: string;

  @Prop({ required: true })
  expiresAt!: Date;

  @Prop({ type: Date, default: null })
  revokedAt!: Date | null;

  @Prop({ type: SchemaTypes.ObjectId, default: null })
  replacedBy!: Types.ObjectId | null;

  @Prop()
  userAgent?: string;

  @Prop()
  ip?: string;
}

export type SessionDocument = HydratedDocument<Session>;
export const SessionSchema = SchemaFactory.createForClass(Session);
SessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 7 * 24 * 3600 });
