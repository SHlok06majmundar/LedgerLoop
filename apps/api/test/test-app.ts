import type { INestApplication } from '@nestjs/common';
import { getConnectionToken } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import type { Connection } from 'mongoose';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';

export interface TestApp {
  app: INestApplication;
  http: () => ReturnType<typeof request>;
  reset: () => Promise<void>;
  close: () => Promise<void>;
}

export async function createTestApp(): Promise<TestApp> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication({ logger: ['error'] });
  configureApp(app);
  await app.init();

  const connection = app.get<Connection>(getConnectionToken());
  if (!connection.name.endsWith('_test')) {
    throw new Error(`Refusing to run e2e tests against database "${connection.name}"`);
  }

  return {
    app,
    http: () => request(app.getHttpServer()),
    reset: async () => {
      const collections = await connection.db!.collections();
      await Promise.all(collections.map((c) => c.deleteMany({})));
    },
    close: () => app.close(),
  };
}
