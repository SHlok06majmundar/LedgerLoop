import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { SchemaTypes, Types, type HydratedDocument } from 'mongoose';

@Schema({ timestamps: true, collection: 'organizations' })
export class Organization {
  @Prop({ required: true, trim: true })
  name!: string;

  @Prop({ required: true, unique: true })
  slug!: string;

  @Prop({ required: true, default: 'INR' })
  currency!: string;

  @Prop({ required: true, default: 'Asia/Kolkata' })
  timezone!: string;

  @Prop({ type: SchemaTypes.ObjectId, required: true })
  createdBy!: Types.ObjectId;

  /** Platform-level suspension by a Super Admin. */
  @Prop({ default: false })
  isSuspended!: boolean;

  createdAt!: Date;
  updatedAt!: Date;
}

export type OrganizationDocument = HydratedDocument<Organization>;
export const OrganizationSchema = SchemaFactory.createForClass(Organization);
