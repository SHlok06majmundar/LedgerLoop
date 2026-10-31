import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { Permission } from '@ledgerloop/shared-types';
import { dateRangeQuerySchema } from '@ledgerloop/validation';
import { z } from 'zod';
import {
  CurrentOrg,
  RequirePermission,
  type OrgAccess,
} from '../../common/decorators/organization.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { AnalyticsService } from './analytics.service';

const monthsQuery = z.object({ months: z.coerce.number().int().min(1).max(36).default(12) });
const limitQuery = z.object({ limit: z.coerce.number().int().min(1).max(50).default(10) });

@ApiTags('analytics')
@ApiBearerAuth()
@ApiSecurity('organization')
@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  @Get('dashboard')
  @RequirePermission(Permission.ANALYTICS_READ)
  dashboard(
    @CurrentOrg() org: OrgAccess,
    @Query(new ZodValidationPipe(dateRangeQuerySchema)) query: z.infer<typeof dateRangeQuerySchema>,
  ) {
    return this.analytics.dashboard(org.organizationId, query);
  }

  @Get('collections')
  @RequirePermission(Permission.ANALYTICS_READ)
  collections(
    @CurrentOrg() org: OrgAccess,
    @Query(new ZodValidationPipe(monthsQuery)) query: z.infer<typeof monthsQuery>,
  ) {
    return this.analytics.collections(org.organizationId, query.months);
  }

  @Get('aging')
  @RequirePermission(Permission.ANALYTICS_READ)
  aging(@CurrentOrg() org: OrgAccess) {
    return this.analytics.aging(org.organizationId);
  }

  @Get('customers')
  @RequirePermission(Permission.ANALYTICS_READ)
  customers(
    @CurrentOrg() org: OrgAccess,
    @Query(new ZodValidationPipe(limitQuery)) query: z.infer<typeof limitQuery>,
  ) {
    return this.analytics.topCustomers(org.organizationId, query.limit);
  }

  @Get('reconciliation')
  @RequirePermission(Permission.ANALYTICS_READ)
  reconciliation(@CurrentOrg() org: OrgAccess) {
    return this.analytics.reconciliation(org.organizationId);
  }
}
