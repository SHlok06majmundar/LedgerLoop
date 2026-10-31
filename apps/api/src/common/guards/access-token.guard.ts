import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { unauthorized } from '../errors/app-exception';
import { RequestContext } from '../context/request-context';
import { IS_PUBLIC } from '../decorators/public.decorator';
import type { AuthedRequest } from '../decorators/current-user.decorator';
import type { AccessTokenPayload } from '../../modules/auth/auth.service';
import { SessionsService } from '../../modules/auth/sessions.service';
import { UsersService } from '../../modules/users/users.service';

/**
 * Global guard: every route needs a valid access token whose session is
 * still active and whose user is not disabled, unless marked @Public().
 */
@Injectable()
export class AccessTokenGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    private readonly sessions: SessionsService,
    private readonly users: UsersService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<AuthedRequest>();
    const [scheme, token] = (request.header('authorization') ?? '').split(' ');
    if (scheme !== 'Bearer' || !token) throw unauthorized();

    let payload: AccessTokenPayload;
    try {
      payload = await this.jwt.verifyAsync<AccessTokenPayload>(token);
    } catch {
      throw unauthorized('TOKEN_EXPIRED', 'Access token is invalid or expired');
    }

    const [sessionActive, user] = await Promise.all([
      this.sessions.isActive(payload.sid),
      this.users.findById(payload.sub),
    ]);
    if (!sessionActive) throw unauthorized('SESSION_REVOKED', 'Session has ended');
    if (!user?.isActive) throw unauthorized('ACCOUNT_DISABLED', 'This account has been disabled');

    request.auth = { userId: payload.sub, sessionId: payload.sid };
    RequestContext.set({ userId: payload.sub });
    return true;
  }
}
