import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { Permission } from '@ledgerloop/shared-types';
import {
  idSchema,
  ignoreExceptionSchema,
  listExceptionsQuerySchema,
  listMatchesQuerySchema,
  manualMatchSchema,
  paginationQuerySchema,
  rejectMatchSchema,
  updateExceptionSchema,
  type IgnoreExceptionInput,
  type ListExceptionsQuery,
  type ListMatchesQuery,
  type ManualMatchInput,
  type PaginationQuery,
  type RejectMatchInput,
  type UpdateExceptionInput,
} from '@ledgerloop/validation';
import {
  CurrentOrg,
  RequirePermission,
  type OrgAccess,
} from '../../common/decorators/organization.decorator';
import { ResponseMessage } from '../../common/decorators/response-message.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { ReconciliationService } from './reconciliation.service';

const IdParam = new ZodValidationPipe(idSchema);

@ApiTags('reconciliation')
@ApiBearerAuth()
@ApiSecurity('organization')
@Controller('reconciliation')
export class ReconciliationController {
  constructor(private readonly reconciliation: ReconciliationService) {}

  @Post('runs')
  @HttpCode(202)
  @RequirePermission(Permission.RECONCILIATION_RUN)
  @ResponseMessage('Reconciliation started')
  start(@CurrentOrg() org: OrgAccess) {
    return this.reconciliation.start(org.organizationId);
  }

  @Get('runs')
  @RequirePermission(Permission.RECONCILIATION_READ)
  runs(
    @CurrentOrg() org: OrgAccess,
    @Query(new ZodValidationPipe(paginationQuerySchema)) query: PaginationQuery,
  ) {
    return this.reconciliation.listRuns(org.organizationId, query);
  }

  @Get('runs/:id')
  @RequirePermission(Permission.RECONCILIATION_READ)
  run(@CurrentOrg() org: OrgAccess, @Param('id', IdParam) id: string) {
    return this.reconciliation.getRun(org.organizationId, id);
  }

  @Get('matches')
  @RequirePermission(Permission.RECONCILIATION_READ)
  matches(
    @CurrentOrg() org: OrgAccess,
    @Query(new ZodValidationPipe(listMatchesQuerySchema)) query: ListMatchesQuery,
  ) {
    return this.reconciliation.listMatches(org.organizationId, query);
  }

  @Get('matches/:id')
  @RequirePermission(Permission.RECONCILIATION_READ)
  match(@CurrentOrg() org: OrgAccess, @Param('id', IdParam) id: string) {
    return this.reconciliation.getMatch(org.organizationId, id);
  }

  @Post('matches/:id/approve')
  @HttpCode(200)
  @RequirePermission(Permission.RECONCILIATION_APPROVE)
  @ResponseMessage('Match approved')
  approve(@CurrentOrg() org: OrgAccess, @Param('id', IdParam) id: string) {
    return this.reconciliation.approve(org.organizationId, id);
  }

  @Post('matches/:id/reject')
  @HttpCode(200)
  @RequirePermission(Permission.RECONCILIATION_APPROVE)
  @ResponseMessage('Match rejected')
  reject(
    @CurrentOrg() org: OrgAccess,
    @Param('id', IdParam) id: string,
    @Body(new ZodValidationPipe(rejectMatchSchema)) body: RejectMatchInput,
  ) {
    return this.reconciliation.reject(org.organizationId, id, body.reason);
  }

  /** Spec route: manual match starting from an existing suggestion. */
  @Post('matches/:id/manual-match')
  @HttpCode(200)
  @RequirePermission(Permission.RECONCILIATION_APPROVE)
  @ResponseMessage('Transaction matched')
  async manualFromMatch(
    @CurrentOrg() org: OrgAccess,
    @Param('id', IdParam) id: string,
    @Body(new ZodValidationPipe(manualMatchSchema)) body: ManualMatchInput,
  ) {
    const match = await this.reconciliation.getMatch(org.organizationId, id);
    return this.reconciliation.manualMatch(
      org.organizationId,
      match.bankTransactionId.toString(),
      body,
    );
  }

  @Post('transactions/:id/manual-match')
  @HttpCode(200)
  @RequirePermission(Permission.RECONCILIATION_APPROVE)
  @ResponseMessage('Transaction matched')
  manual(
    @CurrentOrg() org: OrgAccess,
    @Param('id', IdParam) id: string,
    @Body(new ZodValidationPipe(manualMatchSchema)) body: ManualMatchInput,
  ) {
    return this.reconciliation.manualMatch(org.organizationId, id, body);
  }

  @Get('exceptions')
  @RequirePermission(Permission.RECONCILIATION_READ)
  exceptions(
    @CurrentOrg() org: OrgAccess,
    @Query(new ZodValidationPipe(listExceptionsQuerySchema)) query: ListExceptionsQuery,
  ) {
    return this.reconciliation.listExceptions(org.organizationId, query);
  }

  @Patch('exceptions/:id')
  @RequirePermission(Permission.RECONCILIATION_READ)
  @ResponseMessage('Exception updated')
  updateException(
    @CurrentOrg() org: OrgAccess,
    @Param('id', IdParam) id: string,
    @Body(new ZodValidationPipe(updateExceptionSchema)) body: UpdateExceptionInput,
  ) {
    return this.reconciliation.updateException(org.organizationId, id, body);
  }

  @Post('exceptions/:id/ignore')
  @HttpCode(200)
  @RequirePermission(Permission.RECONCILIATION_APPROVE)
  @ResponseMessage('Exception ignored')
  ignore(
    @CurrentOrg() org: OrgAccess,
    @Param('id', IdParam) id: string,
    @Body(new ZodValidationPipe(ignoreExceptionSchema)) body: IgnoreExceptionInput,
  ) {
    return this.reconciliation.ignoreException(org.organizationId, id, body.reason);
  }
}
