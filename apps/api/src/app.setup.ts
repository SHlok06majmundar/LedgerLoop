import type { INestApplication } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';
import { requestContextMiddleware } from './common/context/request-context';
import { AppConfig } from './config/app-config.service';

/** HTTP setup shared by the server entrypoint and e2e tests. */
export function configureApp(app: INestApplication): void {
  const config = app.get(AppConfig);

  app.useLogger(app.get(Logger));
  app.setGlobalPrefix('api/v1', { exclude: ['health'] });
  app.use(requestContextMiddleware);
  app.use(helmet());
  app.use(cookieParser());
  app.enableCors({ origin: config.get('WEB_ORIGINS'), credentials: true });
  app.enableShutdownHooks();
}
