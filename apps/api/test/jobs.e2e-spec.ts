import { getModelToken } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import { JobQueue } from '../src/jobs/job-queue.service';
import { Job } from '../src/jobs/job.schema';
import { createTestApp, type TestApp } from './test-app';

describe('JobQueue', () => {
  let t: TestApp;
  let queue: JobQueue;
  let jobs: Model<Job>;

  beforeAll(async () => {
    t = await createTestApp();
    queue = t.app.get(JobQueue);
    jobs = t.app.get(getModelToken(Job.name));
  });
  beforeEach(() => t.reset());
  afterAll(() => t.close());

  it('runs an enqueued job with its payload', async () => {
    const seen: unknown[] = [];
    queue.register('test.echo', async (payload) => {
      seen.push(payload);
    });

    await queue.enqueue('test.echo', { n: 1 });
    const ran = await queue.drain();

    expect(ran).toBe(1);
    expect(seen).toEqual([{ n: 1 }]);
    expect(await jobs.findOne({ name: 'test.echo' })).toMatchObject({ status: 'COMPLETED' });
  });

  it('retries a failing job later and gives up after max attempts', async () => {
    queue.register('test.flaky', () => Promise.reject(new Error('boom')));
    await queue.enqueue('test.flaky', {}, { maxAttempts: 2 });

    await queue.drain();
    const afterFirst = await jobs.findOne({ name: 'test.flaky' }).lean();
    expect(afterFirst).toMatchObject({ status: 'PENDING', attempts: 1, lastError: 'boom' });
    expect(afterFirst!.runAt.getTime()).toBeGreaterThan(Date.now());

    await jobs.updateOne({ name: 'test.flaky' }, { runAt: new Date() });
    await queue.drain();

    expect(await jobs.findOne({ name: 'test.flaky' }).lean()).toMatchObject({
      status: 'FAILED',
      attempts: 2,
    });
  });

  it('ignores a duplicate while the first job is still waiting', async () => {
    queue.register('test.once', async () => undefined);

    const first = await queue.enqueue('test.once', {}, { dedupeKey: 'k1' });
    const second = await queue.enqueue('test.once', {}, { dedupeKey: 'k1' });

    expect([first, second]).toEqual([true, false]);
    expect(await jobs.countDocuments({ name: 'test.once' })).toBe(1);
  });

  it('does not run jobs scheduled for the future', async () => {
    queue.register('test.later', async () => undefined);

    await queue.enqueue('test.later', {}, { runAt: new Date(Date.now() + 60_000) });

    expect(await queue.drain()).toBe(0);
  });
});
