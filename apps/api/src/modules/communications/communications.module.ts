import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CustomersModule } from '../customers/customers.module';
import { InvoicesModule } from '../invoices/invoices.module';
import { Communication, CommunicationSchema } from './communication.schema';
import { CommunicationsController, InvoiceSendController } from './communications.controller';
import { CommunicationsService } from './communications.service';

@Module({
  imports: [
    CustomersModule,
    InvoicesModule,
    MongooseModule.forFeature([{ name: Communication.name, schema: CommunicationSchema }]),
  ],
  controllers: [CommunicationsController, InvoiceSendController],
  providers: [CommunicationsService],
  exports: [CommunicationsService, MongooseModule],
})
export class CommunicationsModule {}
