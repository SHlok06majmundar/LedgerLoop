import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { AppConfig } from './config/app-config.service';
import { JobWorker } from './jobs/job-worker';

/** Background worker process: runs queued jobs, serves no HTTP. */
async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));
  app.enableShutdownHooks();
  app.get(JobWorker).start(app.get(AppConfig).get('WORKER_CONCURRENCY'));
}

void bootstrap();
