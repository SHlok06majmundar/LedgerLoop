import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import type { AuthedRequest } from '../../common/decorators/current-user.decorator';
import { forbidden } from '../../common/errors/app-exception';
import { UsersService } from '../users/users.service';

/** Allows only platform Super Admins; checked on every request so revocation is immediate. */
@Injectable()
export class SuperAdminGuard implements CanActivate {
  constructor(private readonly users: UsersService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthedRequest>();
    const user = request.auth ? await this.users.findById(request.auth.userId) : null;
    if (!user?.isSuperAdmin) throw forbidden('SUPER_ADMIN_ONLY', 'Super Admin access required');
    return true;
  }
}
