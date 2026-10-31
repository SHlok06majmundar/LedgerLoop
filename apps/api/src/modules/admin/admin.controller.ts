import { Body, Controller, Get, Param, Patch, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { idSchema, paginationQuerySchema, type PaginationQuery } from '@ledgerloop/validation';
import { z } from 'zod';
import { CurrentUser, type AuthUser } from '../../common/decorators/current-user.decorator';
import { ResponseMessage } from '../../common/decorators/response-message.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { AdminService } from './admin.service';
import { SuperAdminGuard } from './super-admin.guard';

const IdParam = new ZodValidationPipe(idSchema);
const suspendSchema = z.object({ isSuspended: z.boolean() });
const activeSchema = z.object({ isActive: z.boolean() });

@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(SuperAdminGuard)
@Controller('admin')
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Get('stats')
  stats() {
    return this.admin.stats();
  }

  @Get('organizations')
  organizations(@Query(new ZodValidationPipe(paginationQuerySchema)) query: PaginationQuery) {
    return this.admin.listOrganizations(query);
  }

  @Patch('organizations/:id')
  @ResponseMessage('Organization updated')
  updateOrganization(
    @Param('id', IdParam) id: string,
    @Body(new ZodValidationPipe(suspendSchema)) body: z.infer<typeof suspendSchema>,
  ) {
    return this.admin.setOrganizationSuspended(id, body.isSuspended);
  }

  @Get('users')
  users(@Query(new ZodValidationPipe(paginationQuerySchema)) query: PaginationQuery) {
    return this.admin.listUsers(query);
  }

  @Patch('users/:id')
  @ResponseMessage('User updated')
  updateUser(
    @CurrentUser() actor: AuthUser,
    @Param('id', IdParam) id: string,
    @Body(new ZodValidationPipe(activeSchema)) body: z.infer<typeof activeSchema>,
  ) {
    return this.admin.setUserActive(actor.userId, id, body.isActive);
  }
}
