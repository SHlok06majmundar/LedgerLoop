import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CommunicationsModule } from '../communications/communications.module';
import { CustomersModule } from '../customers/customers.module';
import { InvoicesModule } from '../invoices/invoices.module';
import { CollectionSettings, CollectionSettingsSchema } from './collection-settings.schema';
import { CollectionsController } from './collections.controller';
import { CollectionsService } from './collections.service';

@Module({
  imports: [
    CommunicationsModule,
    CustomersModule,
    InvoicesModule,
    MongooseModule.forFeature([
      { name: CollectionSettings.name, schema: CollectionSettingsSchema },
    ]),
  ],
  controllers: [CollectionsController],
  providers: [CollectionsService],
})
export class CollectionsModule {}
