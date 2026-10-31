import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { SchemaTypes, type HydratedDocument } from 'mongoose';

export const JobStatus = {
  PENDING: 'PENDING',
  RUNNING: 'RUNNING',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
} as const;
export type JobStatus = (typeof JobStatus)[keyof typeof JobStatus];

@Schema({ timestamps: true, collection: 'jobs' })
export class Job {
  @Prop({ required: true })
  name!: string;

  @Prop({ type: SchemaTypes.Mixed, default: {} })
  payload!: Record<string, unknown>;

  @Prop({ required: true, enum: Object.values(JobStatus), default: JobStatus.PENDING })
  status!: JobStatus;

  @Prop({ required: true, default: () => new Date() })
  runAt!: Date;

  @Prop({ required: true, default: 0 })
  attempts!: number;

  @Prop({ required: true, default: 5 })
  maxAttempts!: number;

  /** Prevents enqueueing the same logical job twice while one is pending or running. */
  @Prop()
  dedupeKey?: string;

  @Prop() lockedBy?: string;
  @Prop({ type: Date, default: null }) lockedUntil!: Date | null;
  @Prop() lastError?: string;
  @Prop({ type: Date, default: null }) completedAt!: Date | null;

  createdAt!: Date;
  updatedAt!: Date;
}

export type JobDocument = HydratedDocument<Job>;
export const JobSchema = SchemaFactory.createForClass(Job);
JobSchema.index({ status: 1, runAt: 1 });
JobSchema.index({ status: 1, lockedUntil: 1 });
JobSchema.index(
  { dedupeKey: 1 },
  {
    unique: true,
    partialFilterExpression: {
      dedupeKey: { $type: 'string' },
      status: { $in: [JobStatus.PENDING, JobStatus.RUNNING] },
    },
  },
);
// Finished jobs are kept for a week for troubleshooting.
JobSchema.index(
  { completedAt: 1 },
  { expireAfterSeconds: 7 * 24 * 3600, partialFilterExpression: { status: JobStatus.COMPLETED } },
);
