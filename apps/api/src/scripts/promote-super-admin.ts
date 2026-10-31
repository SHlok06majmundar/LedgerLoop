import { NestFactory } from '@nestjs/core';
import { getModelToken } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import { AppModule } from '../app.module';
import { User } from '../modules/users/user.schema';

/**
 * Grants or revokes platform Super Admin access.
 *   pnpm --filter @ledgerloop/api admin:promote you@example.com
 *   pnpm --filter @ledgerloop/api admin:promote you@example.com --revoke
 */
async function main() {
  const email = process.argv[2]?.toLowerCase();
  const revoke = process.argv.includes('--revoke');
  if (!email) {
    console.error('Usage: admin:promote <email> [--revoke]');
    process.exit(1);
  }
  process.env.RUN_WORKER = 'false';
  process.env.RUN_SCHEDULER = 'false';
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error'] });
  const users = app.get<Model<User>>(getModelToken(User.name));
  const user = await users.findOneAndUpdate({ email }, { isSuperAdmin: !revoke }, { new: true });
  await app.close();
  if (!user) {
    console.error(`No user with email ${email}. Register first, then run this again.`);
    process.exit(1);
  }
  console.log(`${user.email} is ${user.isSuperAdmin ? 'now' : 'no longer'} a Super Admin.`);
}

void main();
