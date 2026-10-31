import { Global, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { IdempotencyInterceptor } from './idempotency.interceptor';
import { IdempotencyRecord, IdempotencySchema } from './idempotency.schema';

@Global()
@Module({
  imports: [
    MongooseModule.forFeature([{ name: IdempotencyRecord.name, schema: IdempotencySchema }]),
  ],
  providers: [IdempotencyInterceptor],
  exports: [IdempotencyInterceptor, MongooseModule],
})
export class IdempotencyModule {}
