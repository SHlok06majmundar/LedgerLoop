import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Role } from '@ledgerloop/shared-types';
import { SchemaTypes, Types, type HydratedDocument } from 'mongoose';

@Schema({ timestamps: true, collection: 'invitations' })
export class Invitation {
  @Prop({ type: SchemaTypes.ObjectId, required: true, ref: 'Organization' })
  organizationId!: Types.ObjectId;

  @Prop({ required: true, lowercase: true, trim: true })
  email!: string;

  @Prop({ required: true, enum: Object.values(Role) })
  role!: Role;

  @Prop({ required: true, unique: true })
  tokenHash!: string;

  @Prop({ type: SchemaTypes.ObjectId, required: true, ref: 'User' })
  invitedBy!: Types.ObjectId;

  @Prop({ required: true })
  expiresAt!: Date;

  @Prop({ type: Date, default: null })
  acceptedAt!: Date | null;

  @Prop({ type: Date, default: null })
  revokedAt!: Date | null;

  createdAt!: Date;
}

export type InvitationDocument = HydratedDocument<Invitation>;
export const InvitationSchema = SchemaFactory.createForClass(Invitation);
InvitationSchema.index({ organizationId: 1, email: 1 });
