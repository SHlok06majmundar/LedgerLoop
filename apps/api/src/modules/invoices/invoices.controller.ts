import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { Permission } from '@ledgerloop/shared-types';
import {
  createInvoiceSchema,
  idSchema,
  listInvoicesQuerySchema,
  updateInvoiceSchema,
  voidInvoiceSchema,
  type CreateInvoiceInput,
  type ListInvoicesQuery,
  type UpdateInvoiceInput,
  type VoidInvoiceInput,
} from '@ledgerloop/validation';
import {
  CurrentOrg,
  RequirePermission,
  type OrgAccess,
} from '../../common/decorators/organization.decorator';
import { ResponseMessage } from '../../common/decorators/response-message.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { InvoicesService } from './invoices.service';

const IdParam = new ZodValidationPipe(idSchema);

@ApiTags('invoices')
@ApiBearerAuth()
@ApiSecurity('organization')
@Controller('invoices')
export class InvoicesController {
  constructor(private readonly invoices: InvoicesService) {}

  @Post()
  @RequirePermission(Permission.INVOICES_WRITE)
  @ResponseMessage('Invoice created successfully')
  create(
    @CurrentOrg() org: OrgAccess,
    @Body(new ZodValidationPipe(createInvoiceSchema)) body: CreateInvoiceInput,
  ) {
    return this.invoices.create(org.organizationId, body);
  }

  @Get()
  @RequirePermission(Permission.INVOICES_READ)
  list(
    @CurrentOrg() org: OrgAccess,
    @Query(new ZodValidationPipe(listInvoicesQuerySchema)) query: ListInvoicesQuery,
  ) {
    return this.invoices.list(org.organizationId, query);
  }

  @Get(':id')
  @RequirePermission(Permission.INVOICES_READ)
  get(@CurrentOrg() org: OrgAccess, @Param('id', IdParam) id: string) {
    return this.invoices.getDetailed(org.organizationId, id);
  }

  @Patch(':id')
  @RequirePermission(Permission.INVOICES_WRITE)
  @ResponseMessage('Invoice updated')
  update(
    @CurrentOrg() org: OrgAccess,
    @Param('id', IdParam) id: string,
    @Body(new ZodValidationPipe(updateInvoiceSchema)) body: UpdateInvoiceInput,
  ) {
    return this.invoices.update(org.organizationId, id, body);
  }

  @Post(':id/issue')
  @HttpCode(200)
  @RequirePermission(Permission.INVOICES_ISSUE)
  @ResponseMessage('Invoice issued')
  issue(@CurrentOrg() org: OrgAccess, @Param('id', IdParam) id: string) {
    return this.invoices.issue(org.organizationId, id);
  }

  @Post(':id/void')
  @HttpCode(200)
  @RequirePermission(Permission.INVOICES_VOID)
  @ResponseMessage('Invoice voided')
  void(
    @CurrentOrg() org: OrgAccess,
    @Param('id', IdParam) id: string,
    @Body(new ZodValidationPipe(voidInvoiceSchema)) body: VoidInvoiceInput,
  ) {
    return this.invoices.void(org.organizationId, id, body.reason);
  }
}
