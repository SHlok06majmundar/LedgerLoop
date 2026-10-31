import { existsSync } from 'node:fs';
import { join } from 'node:path';

const envFile = join(__dirname, '..', '.env');
if (existsSync(envFile)) process.loadEnvFile(envFile);

// Never let e2e tests touch the development database.
process.env.NODE_ENV = 'test';
process.env.MONGODB_DB = process.env.MONGODB_TEST_DB ?? 'ledgerloop_test';
process.env.UPLOAD_DIR = join(__dirname, '..', 'uploads-test');
process.env.LOG_LEVEL = 'error';
