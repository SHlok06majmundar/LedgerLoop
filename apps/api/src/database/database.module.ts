import { Global, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import type { Connection } from 'mongoose';
import { AppConfig } from '../config/app-config.service';
import { jsonPlugin } from './json.plugin';
import { TransactionRunner } from './transaction-runner';

@Global()
@Module({
  imports: [
    MongooseModule.forRootAsync({
      inject: [AppConfig],
      useFactory: (config: AppConfig) => ({
        uri: config.get('MONGODB_URI'),
        dbName: config.get('MONGODB_DB'),
        autoIndex: true,
        connectionFactory: (connection: Connection) => {
          connection.plugin(jsonPlugin);
          return connection;
        },
      }),
    }),
  ],
  providers: [TransactionRunner],
  exports: [TransactionRunner],
})
export class DatabaseModule {}
