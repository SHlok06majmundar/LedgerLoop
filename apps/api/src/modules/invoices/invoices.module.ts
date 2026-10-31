import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CustomersModule } from '../customers/customers.module';
import { Invoice, InvoiceSchema } from './invoice.schema';
import { InvoicesController } from './invoices.controller';
import { InvoiceDocumentsService } from './invoice-documents.service';
import { InvoicesService } from './invoices.service';

@Module({
  imports: [
    CustomersModule,
    MongooseModule.forFeature([{ name: Invoice.name, schema: InvoiceSchema }]),
  ],
  controllers: [InvoicesController],
  providers: [InvoicesService, InvoiceDocumentsService],
  exports: [InvoicesService, InvoiceDocumentsService, MongooseModule],
})
export class InvoicesModule {}
