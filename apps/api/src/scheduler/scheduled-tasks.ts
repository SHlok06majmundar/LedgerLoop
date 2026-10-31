import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { AppConfig } from '../config/app-config.service';
import { JobQueue } from '../jobs/job-queue.service';

export const ScheduledJob = {
  REFRESH_INVOICE_STATUSES: 'invoices.refresh-statuses',
  RUN_REMINDERS: 'collections.run-reminders',
} as const;

/**
 * Turns the clock into queued jobs. Only one scheduler instance should run
 * (RUN_SCHEDULER=true); dedupe keys keep a slow run from piling up.
 */
@Injectable()
export class ScheduledTasks {
  private readonly logger = new Logger(ScheduledTasks.name);

  constructor(
    private readonly queue: JobQueue,
    private readonly config: AppConfig,
  ) {}

  @Cron('5 * * * *')
  refreshInvoiceStatuses() {
    return this.trigger(ScheduledJob.REFRESH_INVOICE_STATUSES);
  }

  @Cron('15 * * * *')
  runReminders() {
    return this.trigger(ScheduledJob.RUN_REMINDERS);
  }

  private async trigger(name: string) {
    if (!this.config.get('RUN_SCHEDULER')) return;
    const queued = await this.queue.enqueue(name, {}, { dedupeKey: name, maxAttempts: 3 });
    if (queued) this.logger.log(`Queued ${name}`);
  }
}
