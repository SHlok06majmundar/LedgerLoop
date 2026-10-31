import { Module } from '@nestjs/common';
import type { IncomingMessage } from 'node:http';
import { LoggerModule } from 'nestjs-pino';
import { AppConfig } from '../config/app-config.service';

@Module({
  imports: [
    LoggerModule.forRootAsync({
      inject: [AppConfig],
      useFactory: (config: AppConfig) => ({
        pinoHttp: {
          level: config.get('LOG_LEVEL'),
          genReqId: (req: IncomingMessage) => (req as IncomingMessage & { id: string }).id,
          redact: ['req.headers.authorization', 'req.headers.cookie', 'res.headers["set-cookie"]'],
          autoLogging: { ignore: (req: IncomingMessage) => req.url === '/health' },
          transport: config.isProduction
            ? undefined
            : { target: 'pino-pretty', options: { singleLine: true, colorize: true } },
        },
      }),
    }),
  ],
})
export class LoggingModule {}
