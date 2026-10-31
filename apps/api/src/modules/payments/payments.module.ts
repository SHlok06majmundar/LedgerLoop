import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CustomersModule } from '../customers/customers.module';
import { InvoicesModule } from '../invoices/invoices.module';
import { CustomerAccountsService } from './customer-accounts.service';
import { LedgerService } from './ledger.service';
import {
  CustomerAccountsController,
  InvoicePaymentsController,
  PaymentsController,
} from './payments.controller';
import { PaymentsService } from './payments.service';
import { Allocation, AllocationSchema } from './schemas/allocation.schema';
import { Payment, PaymentSchema } from './schemas/payment.schema';
import { Reversal, ReversalSchema } from './schemas/reversal.schema';

@Module({
  imports: [
    CustomersModule,
    InvoicesModule,
    MongooseModule.forFeature([
      { name: Payment.name, schema: PaymentSchema },
      { name: Allocation.name, schema: AllocationSchema },
      { name: Reversal.name, schema: ReversalSchema },
    ]),
  ],
  controllers: [PaymentsController, InvoicePaymentsController, CustomerAccountsController],
  providers: [PaymentsService, LedgerService, CustomerAccountsService],
  exports: [PaymentsService, LedgerService, MongooseModule],
})
export class PaymentsModule {}
