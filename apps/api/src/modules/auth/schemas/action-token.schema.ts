import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { SchemaTypes, Types, type HydratedDocument } from 'mongoose';

export const ActionTokenType = {
  VERIFY_EMAIL: 'VERIFY_EMAIL',
  RESET_PASSWORD: 'RESET_PASSWORD',
} as const;
export type ActionTokenType = (typeof ActionTokenType)[keyof typeof ActionTokenType];

/** Single-use emailed token (email verification, password reset). */
@Schema({ timestamps: true, collection: 'action_tokens' })
export class ActionToken {
  @Prop({ type: SchemaTypes.ObjectId, required: true, index: true })
  userId!: Types.ObjectId;

  @Prop({ required: true, enum: Object.values(ActionTokenType) })
  type!: ActionTokenType;

  @Prop({ required: true, unique: true })
  tokenHash!: string;

  @Prop({ required: true })
  expiresAt!: Date;

  @Prop({ type: Date, default: null })
  usedAt!: Date | null;
}

export type ActionTokenDocument = HydratedDocument<ActionToken>;
export const ActionTokenSchema = SchemaFactory.createForClass(ActionToken);
ActionTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 24 * 3600 });
