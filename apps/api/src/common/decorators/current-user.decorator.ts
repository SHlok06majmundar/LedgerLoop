import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';

export interface AuthUser {
  userId: string;
  sessionId: string;
}

export type AuthedRequest = Request & { auth?: AuthUser };

/** The authenticated caller, set by the access-token guard. */
export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): AuthUser => {
  const auth = ctx.switchToHttp().getRequest<AuthedRequest>().auth;
  if (!auth) throw new Error('CurrentUser used on a public route');
  return auth;
});
