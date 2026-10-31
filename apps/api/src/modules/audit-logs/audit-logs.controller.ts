import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { Permission } from '@ledgerloop/shared-types';
import { paginationQuerySchema } from '@ledgerloop/validation';
import { z } from 'zod';
import {
  CurrentOrg,
  RequirePermission,
  type OrgAccess,
} from '../../common/decorators/organization.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { AuditLogsService } from './audit-logs.service';

const auditQuerySchema = paginationQuerySchema.extend({
  entityType: z.string().max(50).optional(),
  entityId: z
    .string()
    .regex(/^[a-f\d]{24}$/i)
    .optional(),
  action: z.string().max(80).optional(),
});

@ApiTags('audit-logs')
@ApiBearerAuth()
@ApiSecurity('organization')
@Controller('audit-logs')
export class AuditLogsController {
  constructor(private readonly audit: AuditLogsService) {}

  @Get()
  @RequirePermission(Permission.AUDIT_READ)
  list(
    @CurrentOrg() org: OrgAccess,
    @Query(new ZodValidationPipe(auditQuerySchema)) query: z.infer<typeof auditQuerySchema>,
  ) {
    return this.audit.list(org.organizationId, query);
  }
}
