import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { MemberStatus, Role } from '@ledgerloop/shared-types';
import { SchemaTypes, Types, type HydratedDocument } from 'mongoose';

@Schema({ timestamps: true, collection: 'memberships' })
export class Membership {
  @Prop({ type: SchemaTypes.ObjectId, required: true, ref: 'Organization' })
  organizationId!: Types.ObjectId;

  @Prop({ type: SchemaTypes.ObjectId, required: true, ref: 'User' })
  userId!: Types.ObjectId;

  @Prop({ required: true, enum: Object.values(Role) })
  role!: Role;

  @Prop({ required: true, enum: Object.values(MemberStatus), default: MemberStatus.ACTIVE })
  status!: MemberStatus;

  createdAt!: Date;
  updatedAt!: Date;
}

export type MembershipDocument = HydratedDocument<Membership>;
export const MembershipSchema = SchemaFactory.createForClass(Membership);
MembershipSchema.index({ organizationId: 1, userId: 1 }, { unique: true });
MembershipSchema.index({ userId: 1, status: 1 });
