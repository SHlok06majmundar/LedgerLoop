import { Body, Controller, Get, HttpCode, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { Permission } from '@ledgerloop/shared-types';
import {
  collectionSettingsSchema,
  createReminderSchema,
  idSchema,
  listRemindersQuerySchema,
  updateReminderSchema,
  type CollectionSettingsInput,
  type CreateReminderInput,
  type ListRemindersQuery,
  type UpdateReminderInput,
} from '@ledgerloop/validation';
import {
  CurrentOrg,
  RequirePermission,
  type OrgAccess,
} from '../../common/decorators/organization.decorator';
import { ResponseMessage } from '../../common/decorators/response-message.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { CollectionsService } from './collections.service';

const IdParam = new ZodValidationPipe(idSchema);

@ApiTags('collections')
@ApiBearerAuth()
@ApiSecurity('organization')
@Controller('collections')
export class CollectionsController {
  constructor(private readonly collections: CollectionsService) {}

  @Get('settings')
  @RequirePermission(Permission.INVOICES_READ)
  settings(@CurrentOrg() org: OrgAccess) {
    return this.collections.getSettings(org.organizationId);
  }

  @Put('settings')
  @RequirePermission(Permission.COLLECTIONS_MANAGE)
  @ResponseMessage('Reminder schedule saved')
  updateSettings(
    @CurrentOrg() org: OrgAccess,
    @Body(new ZodValidationPipe(collectionSettingsSchema)) body: CollectionSettingsInput,
  ) {
    return this.collections.updateSettings(org.organizationId, body);
  }

  @Post('run')
  @HttpCode(200)
  @RequirePermission(Permission.COLLECTIONS_MANAGE)
  @ResponseMessage('Reminder run finished')
  async run(@CurrentOrg() org: OrgAccess) {
    return { queued: await this.collections.runForOrganization(org.organizationId) };
  }

  @Post('reminders')
  @RequirePermission(Permission.COLLECTIONS_MANAGE)
  @ResponseMessage('Reminder scheduled')
  create(
    @CurrentOrg() org: OrgAccess,
    @Body(new ZodValidationPipe(createReminderSchema)) body: CreateReminderInput,
  ) {
    return this.collections.createManual(org.organizationId, body);
  }

  @Get('reminders')
  @RequirePermission(Permission.INVOICES_READ)
  list(
    @CurrentOrg() org: OrgAccess,
    @Query(new ZodValidationPipe(listRemindersQuerySchema)) query: ListRemindersQuery,
  ) {
    return this.collections.listReminders(org.organizationId, query);
  }

  @Post('reminders/:id/send')
  @HttpCode(200)
  @RequirePermission(Permission.COLLECTIONS_MANAGE)
  @ResponseMessage('Reminder is being sent')
  send(@CurrentOrg() org: OrgAccess, @Param('id', IdParam) id: string) {
    return this.collections.sendNow(org.organizationId, id);
  }

  @Patch('reminders/:id')
  @RequirePermission(Permission.COLLECTIONS_MANAGE)
  @ResponseMessage('Reminder updated')
  update(
    @CurrentOrg() org: OrgAccess,
    @Param('id', IdParam) id: string,
    @Body(new ZodValidationPipe(updateReminderSchema)) body: UpdateReminderInput,
  ) {
    return this.collections.update(org.organizationId, id, body);
  }

  @Post('invoices/:id/pause')
  @HttpCode(200)
  @RequirePermission(Permission.COLLECTIONS_MANAGE)
  @ResponseMessage('Reminders paused for this invoice')
  pause(@CurrentOrg() org: OrgAccess, @Param('id', IdParam) id: string) {
    return this.collections.setInvoicePaused(org.organizationId, id, true);
  }

  @Post('invoices/:id/resume')
  @HttpCode(200)
  @RequirePermission(Permission.COLLECTIONS_MANAGE)
  @ResponseMessage('Reminders resumed for this invoice')
  resume(@CurrentOrg() org: OrgAccess, @Param('id', IdParam) id: string) {
    return this.collections.setInvoicePaused(org.organizationId, id, false);
  }
}
