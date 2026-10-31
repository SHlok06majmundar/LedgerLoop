import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { AccessTokenGuard } from './common/guards/access-token.guard';
import { ResponseEnvelopeInterceptor } from './common/interceptors/response-envelope.interceptor';
import { ConfigModule } from './config/config.module';
import { DatabaseModule } from './database/database.module';
import { HealthController } from './health/health.controller';
import { LoggingModule } from './logging/logging.module';
import { MailModule } from './mail/mail.module';
import { AuthModule } from './modules/auth/auth.module';

@Module({
  imports: [
    ConfigModule,
    LoggingModule,
    DatabaseModule,
    MailModule,
    ThrottlerModule.forRoot({
      throttlers: [{ limit: 300, ttl: 60_000 }],
      skipIf: () => process.env.NODE_ENV === 'test',
    }),
    AuthModule,
  ],
  controllers: [HealthController],
  providers: [
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_INTERCEPTOR, useClass: ResponseEnvelopeInterceptor },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: AccessTokenGuard },
  ],
})
export class AppModule {}
