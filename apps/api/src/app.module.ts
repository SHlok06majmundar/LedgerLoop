import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { IdempotencyModule } from './common/idempotency/idempotency.module';
import { AccessTokenGuard } from './common/guards/access-token.guard';
import { OrganizationGuard } from './common/guards/organization.guard';
import { ResponseEnvelopeInterceptor } from './common/interceptors/response-envelope.interceptor';
import { ConfigModule } from './config/config.module';
import { DatabaseModule } from './database/database.module';
import { HealthController } from './health/health.controller';
import { LoggingModule } from './logging/logging.module';
import { JobsModule } from './jobs/jobs.module';
import { MailModule } from './mail/mail.module';
import { SchedulerModule } from './scheduler/scheduler.module';
import { StorageModule } from './storage/storage.module';
import { AuditLogsModule } from './modules/audit-logs/audit-logs.module';
import { AuthModule } from './modules/auth/auth.module';
import { AnalyticsModule } from './modules/analytics/analytics.module';
import { BankImportsModule } from './modules/bank-imports/bank-imports.module';
import { CollectionsModule } from './modules/collections/collections.module';
import { CommunicationsModule } from './modules/communications/communications.module';
import { CustomersModule } from './modules/customers/customers.module';
import { InvoicesModule } from './modules/invoices/invoices.module';
import { OrganizationsModule } from './modules/organizations/organizations.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { ReconciliationModule } from './modules/reconciliation/reconciliation.module';

@Module({
  imports: [
    ConfigModule,
    LoggingModule,
    DatabaseModule,
    MailModule,
    StorageModule,
    JobsModule,
    SchedulerModule,
    IdempotencyModule,
    ThrottlerModule.forRoot({
      throttlers: [{ limit: 300, ttl: 60_000 }],
      skipIf: () => process.env.NODE_ENV === 'test',
    }),
    AuditLogsModule,
    AuthModule,
    OrganizationsModule,
    CustomersModule,
    InvoicesModule,
    PaymentsModule,
    CommunicationsModule,
    BankImportsModule,
    ReconciliationModule,
    CollectionsModule,
    AnalyticsModule,
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
