import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';

/** Scheduler process: deploy exactly one instance. */
async function bootstrap() {
  process.env.RUN_SCHEDULER = 'true';
  const app = await NestFactory.createApplicationContext(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));
  app.enableShutdownHooks();
}

void bootstrap();
