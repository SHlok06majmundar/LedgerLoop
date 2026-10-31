import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { SchemaTypes, Types, type HydratedDocument } from 'mongoose';
import { DEFAULT_RULES, type ReminderRule } from './domain/reminder-schedule';

/** Automated reminder schedule of one organization. */
@Schema({ timestamps: true, collection: 'collection_settings' })
export class CollectionSettings {
  @Prop({ type: SchemaTypes.ObjectId, required: true, unique: true })
  organizationId!: Types.ObjectId;

  @Prop({ required: true, default: true })
  enabled!: boolean;

  @Prop({ required: true, default: 10 })
  sendHour!: number;

  @Prop({ type: SchemaTypes.Mixed, required: true, default: () => DEFAULT_RULES })
  rules!: ReminderRule[];
}

export type CollectionSettingsDocument = HydratedDocument<CollectionSettings>;
export const CollectionSettingsSchema = SchemaFactory.createForClass(CollectionSettings);
