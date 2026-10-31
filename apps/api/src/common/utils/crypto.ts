import { createHash, randomBytes } from 'node:crypto';

/** URL-safe random secret for refresh, verification and invitation tokens. */
export const randomToken = (bytes = 32) => randomBytes(bytes).toString('base64url');

/** Tokens are stored only as hashes so a database leak cannot replay them. */
export const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');
