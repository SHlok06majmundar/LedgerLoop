import { Injectable, Logger, OnApplicationShutdown } from '@nestjs/common';
import { setTimeout as sleep } from 'node:timers/promises';
import { JobQueue } from './job-queue.service';

/** Polls the queue and runs jobs one at a time per slot until shutdown. */
@Injectable()
export class JobWorker implements OnApplicationShutdown {
  private readonly logger = new Logger(JobWorker.name);
  private running = false;
  private loops: Promise<void>[] = [];

  constructor(private readonly queue: JobQueue) {}

  start(concurrency = 2, idleMs = 2000): void {
    if (this.running) return;
    this.running = true;
    this.logger.log(`Worker started with ${concurrency} slots`);
    this.loops = Array.from({ length: concurrency }, () => this.loop(idleMs));
  }

  async onApplicationShutdown(): Promise<void> {
    this.running = false;
    await Promise.all(this.loops);
  }

  private async loop(idleMs: number): Promise<void> {
    while (this.running) {
      try {
        const worked = await this.queue.runNext();
        if (!worked) await sleep(idleMs);
      } catch (err) {
        this.logger.error('Worker loop error', err as Error);
        await sleep(idleMs);
      }
    }
  }
}
