import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { hostname } from 'node:os';
import { randomUUID } from 'node:crypto';
import { mongo, type ClientSession, type Model } from 'mongoose';
import { RequestContext } from '../common/context/request-context';
import { Job, JobStatus, type JobDocument } from './job.schema';

export type JobHandler = (payload: Record<string, unknown>, job: JobDocument) => Promise<void>;

export interface EnqueueOptions {
  runAt?: Date;
  maxAttempts?: number;
  dedupeKey?: string;
  /** Enqueue inside the caller's transaction so the job exists only if the work commits. */
  session?: ClientSession;
}

const LOCK_MS = 5 * 60_000;
const BASE_BACKOFF_MS = 30_000;

/** Durable background jobs stored in MongoDB (docs/adr/0006). */
@Injectable()
export class JobQueue {
  private readonly logger = new Logger(JobQueue.name);
  private readonly handlers = new Map<string, JobHandler>();
  private readonly workerId = `${hostname()}:${process.pid}:${randomUUID().slice(0, 8)}`;

  constructor(@InjectModel(Job.name) private readonly jobs: Model<Job>) {}

  register(name: string, handler: JobHandler): void {
    this.handlers.set(name, handler);
  }

  /** Returns false when a job with the same dedupe key is already waiting. */
  async enqueue(
    name: string,
    payload: Record<string, unknown> = {},
    options: EnqueueOptions = {},
  ): Promise<boolean> {
    try {
      await this.jobs.create(
        [
          {
            name,
            payload,
            runAt: options.runAt ?? new Date(),
            maxAttempts: options.maxAttempts ?? 5,
            dedupeKey: options.dedupeKey,
          },
        ],
        { session: options.session },
      );
      return true;
    } catch (err) {
      if (options.dedupeKey && err instanceof mongo.MongoServerError && err.code === 11000) {
        return false;
      }
      throw err;
    }
  }

  /** Claims and runs one due job. Returns false when nothing is due. */
  async runNext(): Promise<boolean> {
    const now = new Date();
    const job = await this.jobs
      .findOneAndUpdate(
        {
          name: { $in: [...this.handlers.keys()] },
          $or: [
            { status: JobStatus.PENDING, runAt: { $lte: now } },
            // A worker that died mid-job loses its lock after LOCK_MS.
            { status: JobStatus.RUNNING, lockedUntil: { $lt: now } },
          ],
        },
        {
          status: JobStatus.RUNNING,
          lockedBy: this.workerId,
          lockedUntil: new Date(now.getTime() + LOCK_MS),
          $inc: { attempts: 1 },
        },
        { sort: { runAt: 1 }, new: true },
      )
      .exec();
    if (!job) return false;

    const handler = this.handlers.get(job.name)!;
    try {
      await RequestContext.run({ requestId: `job:${job.id as string}` }, () =>
        handler(job.payload, job),
      );
      await this.jobs.updateOne(
        { _id: job._id, lockedBy: this.workerId },
        { status: JobStatus.COMPLETED, completedAt: new Date(), lockedUntil: null },
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const exhausted = job.attempts >= job.maxAttempts;
      this.logger.warn(
        `Job ${job.name} (${job.id as string}) failed on attempt ${job.attempts}: ${message}`,
      );
      await this.jobs.updateOne(
        { _id: job._id, lockedBy: this.workerId },
        {
          status: exhausted ? JobStatus.FAILED : JobStatus.PENDING,
          runAt: new Date(Date.now() + BASE_BACKOFF_MS * 2 ** (job.attempts - 1)),
          lastError: message.slice(0, 2000),
          lockedUntil: null,
        },
      );
    }
    return true;
  }

  /** Runs due jobs until none are left (tests and one-off scripts). */
  async drain(maxJobs = 1000): Promise<number> {
    let ran = 0;
    while (ran < maxJobs && (await this.runNext())) ran++;
    return ran;
  }
}
