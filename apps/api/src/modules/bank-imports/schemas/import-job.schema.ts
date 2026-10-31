import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { ImportJobStatus } from '@ledgerloop/shared-types';
import { SchemaTypes, Types, type HydratedDocument } from 'mongoose';

export interface RowError {
  row: number;
  message: string;
  raw: Record<string, string>;
}

/** One uploaded bank statement being turned into bank transactions. */
@Schema({ timestamps: true, collection: 'import_jobs' })
export class ImportJob {
  @Prop({ type: SchemaTypes.ObjectId, required: true })
  organizationId!: Types.ObjectId;

  @Prop({ required: true }) fileName!: string;
  @Prop({ required: true }) fileKey!: string;
  @Prop({ required: true }) fileSize!: number;

  @Prop({ required: true, enum: Object.values(ImportJobStatus) })
  status!: ImportJobStatus;

  /** 1-based row of the column headers. */
  @Prop({ required: true, default: 1 }) headerRow!: number;
  @Prop({ type: [String], default: [] }) headers!: string[];
  @Prop({ type: SchemaTypes.Mixed, default: {} }) suggestedMapping!: Record<string, string>;
  @Prop({ type: SchemaTypes.Mixed, default: [] }) preview!: Record<string, string>[];

  @Prop({ type: SchemaTypes.Mixed }) mapping?: Record<string, string>;
  @Prop() dateFormat?: string;

  @Prop({ default: 0 }) totalRows!: number;
  @Prop({ default: 0 }) processedRows!: number;
  @Prop({ default: 0 }) importedRows!: number;
  @Prop({ default: 0 }) duplicateRows!: number;
  @Prop({ default: 0 }) failedRows!: number;

  /** First failures only; the full list is in the error report file. */
  @Prop({ type: SchemaTypes.Mixed, default: [] }) rowErrors!: RowError[];
  @Prop() errorReportKey?: string;
  @Prop() failureReason?: string;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'User' }) createdBy?: Types.ObjectId;
  @Prop({ type: Date, default: null }) startedAt!: Date | null;
  @Prop({ type: Date, default: null }) completedAt!: Date | null;

  createdAt!: Date;
}

export type ImportJobDocument = HydratedDocument<ImportJob>;
export const ImportJobSchema = SchemaFactory.createForClass(ImportJob);
ImportJobSchema.index({ organizationId: 1, createdAt: -1 });
