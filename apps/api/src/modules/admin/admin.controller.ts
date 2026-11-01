import { Body, Controller, Delete, Get, Param, Patch, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { idSchema, paginationQuerySchema, type PaginationQuery } from '@ledgerloop/validation';
import { z } from 'zod';
import { CurrentUser, type AuthUser } from '../../common/decorators/current-user.decorator';
import { ResponseMessage } from '../../common/decorators/response-message.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { AdminService } from './admin.service';
import { SuperAdminGuard } from './super-admin.guard';

const IdParam = new ZodValidationPipe(idSchema);
const updateOrganizationSchema = z
  .object({ name: z.string().trim().min(2).max(100), isSuspended: z.boolean() })
  .partial()
  .strict();
const updateUserSchema = z
  .object({
    name: z.string().trim().min(2).max(100),
    isActive: z.boolean(),
    isSuperAdmin: z.boolean(),
  })
  .partial()
  .strict();

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
    @Body(new ZodValidationPipe(updateOrganizationSchema))
    body: z.infer<typeof updateOrganizationSchema>,
  ) {
    return this.admin.updateOrganization(id, body);
  }

  @Delete('organizations/:id')
  @ResponseMessage('Organization deleted')
  async deleteOrganization(@Param('id', IdParam) id: string) {
    await this.admin.deleteOrganization(id);
    return null;
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
    @Body(new ZodValidationPipe(updateUserSchema)) body: z.infer<typeof updateUserSchema>,
  ) {
    return this.admin.updateUser(actor.userId, id, body);
  }

  @Delete('users/:id')
  @ResponseMessage('User deleted')
  async deleteUser(@CurrentUser() actor: AuthUser, @Param('id', IdParam) id: string) {
    await this.admin.deleteUser(actor.userId, id);
    return null;
  }
}
