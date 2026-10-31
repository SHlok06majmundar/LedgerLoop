import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { BankImportsModule } from '../bank-imports/bank-imports.module';
import { CustomersModule } from '../customers/customers.module';
import { InvoicesModule } from '../invoices/invoices.module';
import { PaymentsModule } from '../payments/payments.module';
import { ReconciliationController } from './reconciliation.controller';
import { ReconciliationService } from './reconciliation.service';
import {
  ReconciliationException,
  ReconciliationExceptionSchema,
  ReconciliationMatch,
  ReconciliationMatchSchema,
  ReconciliationRun,
  ReconciliationRunSchema,
} from './schemas/reconciliation.schemas';

@Module({
  imports: [
    BankImportsModule,
    CustomersModule,
    InvoicesModule,
    PaymentsModule,
    MongooseModule.forFeature([
      { name: ReconciliationRun.name, schema: ReconciliationRunSchema },
      { name: ReconciliationMatch.name, schema: ReconciliationMatchSchema },
      { name: ReconciliationException.name, schema: ReconciliationExceptionSchema },
    ]),
  ],
  controllers: [ReconciliationController],
  providers: [ReconciliationService],
  exports: [ReconciliationService, MongooseModule],
})
export class ReconciliationModule {}
