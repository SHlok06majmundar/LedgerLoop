import { Global, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { JobQueue } from './job-queue.service';
import { JobWorker } from './job-worker';
import { Job, JobSchema } from './job.schema';

@Global()
@Module({
  imports: [MongooseModule.forFeature([{ name: Job.name, schema: JobSchema }])],
  providers: [JobQueue, JobWorker],
  exports: [JobQueue, JobWorker],
})
export class JobsModule {}
