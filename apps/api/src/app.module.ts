import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { AccessTokenGuard } from './common/guards/access-token.guard';
import { OrganizationGuard } from './common/guards/organization.guard';
import { ResponseEnvelopeInterceptor } from './common/interceptors/response-envelope.interceptor';
import { ConfigModule } from './config/config.module';
import { DatabaseModule } from './database/database.module';
import { HealthController } from './health/health.controller';
import { LoggingModule } from './logging/logging.module';
import { MailModule } from './mail/mail.module';
import { AuditLogsModule } from './modules/audit-logs/audit-logs.module';
import { AuthModule } from './modules/auth/auth.module';
import { CustomersModule } from './modules/customers/customers.module';
import { OrganizationsModule } from './modules/organizations/organizations.module';

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
    AuditLogsModule,
    AuthModule,
    OrganizationsModule,
    CustomersModule,
  ],
  controllers: [HealthController],
  providers: [
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_INTERCEPTOR, useClass: ResponseEnvelopeInterceptor },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: AccessTokenGuard },
    { provide: APP_GUARD, useClass: OrganizationGuard },
  ],
})
export class AppModule {}
