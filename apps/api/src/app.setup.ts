import type { INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';
import { requestContextMiddleware } from './common/context/request-context';
import { AppConfig } from './config/app-config.service';

/** HTTP setup shared by the server entrypoint and e2e tests. */
export function configureApp(app: INestApplication): void {
  const config = app.get(AppConfig);

  app.useLogger(app.get(Logger));
  const hops = config.get('TRUST_PROXY_HOPS');
  // Rate limits and session IPs need the client address, not the load balancer's.
  if (hops > 0) (app as NestExpressApplication).set('trust proxy', hops);
  app.setGlobalPrefix('api/v1', { exclude: ['health'] });
  app.use(requestContextMiddleware);
  app.use(helmet());
  app.use(cookieParser());
  app.enableCors({ origin: config.get('WEB_ORIGINS'), credentials: true });
  app.enableShutdownHooks();
}
