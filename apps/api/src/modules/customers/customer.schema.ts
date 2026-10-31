import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { SchemaTypes, Types, type HydratedDocument } from 'mongoose';

@Schema({ _id: false })
export class Address {
  @Prop({ default: '' }) line1!: string;
  @Prop({ default: '' }) line2!: string;
  @Prop({ default: '' }) city!: string;
  @Prop({ default: '' }) state!: string;
  @Prop({ default: '' }) postalCode!: string;
  @Prop({ default: 'India' }) country!: string;
}
const AddressSchema = SchemaFactory.createForClass(Address);

@Schema({ timestamps: true, collection: 'customers' })
export class Customer {
  @Prop({ type: SchemaTypes.ObjectId, required: true })
  organizationId!: Types.ObjectId;

  @Prop({ required: true, trim: true })
  name!: string;

  @Prop({ lowercase: true, trim: true })
  email?: string;

  @Prop({ trim: true })
  phone?: string;

  @Prop({ uppercase: true, trim: true })
  gstin?: string;

  @Prop({ type: AddressSchema })
  billingAddress?: Address;

  @Prop({ type: AddressSchema })
  shippingAddress?: Address;

  /** Minor units; unset means no limit. */
  @Prop()
  creditLimitMinor?: number;

  @Prop({ required: true, default: 30 })
  paymentTermsDays!: number;

  @Prop()
  notes?: string;

  /** Communication preference respected by automated reminders. */
  @Prop({ default: true })
  remindersEnabled!: boolean;

  @Prop({ type: Date, default: null })
  archivedAt!: Date | null;

  createdAt!: Date;
  updatedAt!: Date;
}

export type CustomerDocument = HydratedDocument<Customer>;
export const CustomerSchema = SchemaFactory.createForClass(Customer);
CustomerSchema.index({ organizationId: 1, archivedAt: 1, name: 1 });
CustomerSchema.index({ organizationId: 1, email: 1 });
