import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { BankImportsController, BankTransactionsController } from './bank-imports.controller';
import { BankImportsService } from './bank-imports.service';
import { BankTransaction, BankTransactionSchema } from './schemas/bank-transaction.schema';
import { ImportJob, ImportJobSchema } from './schemas/import-job.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: ImportJob.name, schema: ImportJobSchema },
      { name: BankTransaction.name, schema: BankTransactionSchema },
    ]),
  ],
  controllers: [BankImportsController, BankTransactionsController],
  providers: [BankImportsService],
  exports: [BankImportsService, MongooseModule],
})
export class BankImportsModule {}
