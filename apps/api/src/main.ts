import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { configureApp } from './app.setup';
import { AppConfig } from './config/app-config.service';
import { JobWorker } from './jobs/job-worker';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  configureApp(app);

  const openApi = new DocumentBuilder()
    .setTitle('LedgerLoop API')
    .setDescription('Accounts receivable, payments and reconciliation')
    .setVersion('1.0')
    .addBearerAuth()
    .addApiKey({ type: 'apiKey', in: 'header', name: 'X-Organization-Id' }, 'organization')
    .build();
  SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, openApi));

  const config = app.get(AppConfig);
  if (config.get('RUN_WORKER')) app.get(JobWorker).start(config.get('WORKER_CONCURRENCY'));
  await app.listen(config.get('PORT'));
}

void bootstrap();
