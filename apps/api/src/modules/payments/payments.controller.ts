import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { Permission } from '@ledgerloop/shared-types';
import {
  allocatePaymentSchema,
  createPaymentSchema,
  idSchema,
  listInvoicesQuerySchema,
  listPaymentsQuerySchema,
  reversePaymentSchema,
  updatePaymentSchema,
  type AllocatePaymentInput,
  type CreatePaymentInput,
  type ListInvoicesQuery,
  type ListPaymentsQuery,
  type ReversePaymentInput,
  type UpdatePaymentInput,
} from '@ledgerloop/validation';
import {
  CurrentOrg,
  RequirePermission,
  type OrgAccess,
} from '../../common/decorators/organization.decorator';
import { ResponseMessage } from '../../common/decorators/response-message.decorator';
import { Idempotent } from '../../common/idempotency/idempotency.interceptor';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { InvoicesService } from '../invoices/invoices.service';
import { CustomerAccountsService } from './customer-accounts.service';
import { PaymentsService } from './payments.service';

const IdParam = new ZodValidationPipe(idSchema);

@ApiTags('payments')
@ApiBearerAuth()
@ApiSecurity('organization')
@Controller('payments')
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @Post()
  @Idempotent()
  @RequirePermission(Permission.PAYMENTS_WRITE)
  @ResponseMessage('Payment recorded')
  create(
    @CurrentOrg() org: OrgAccess,
    @Body(new ZodValidationPipe(createPaymentSchema)) body: CreatePaymentInput,
  ) {
    return this.payments.create(org.organizationId, body);
  }

  @Get()
  @RequirePermission(Permission.PAYMENTS_READ)
  list(
    @CurrentOrg() org: OrgAccess,
    @Query(new ZodValidationPipe(listPaymentsQuerySchema)) query: ListPaymentsQuery,
  ) {
    return this.payments.list(org.organizationId, query);
  }

  @Get(':id')
  @RequirePermission(Permission.PAYMENTS_READ)
  get(@CurrentOrg() org: OrgAccess, @Param('id', IdParam) id: string) {
    return this.payments.getDetailed(org.organizationId, id);
  }

  @Patch(':id')
  @RequirePermission(Permission.PAYMENTS_WRITE)
  @ResponseMessage('Payment updated')
  update(
    @CurrentOrg() org: OrgAccess,
    @Param('id', IdParam) id: string,
    @Body(new ZodValidationPipe(updatePaymentSchema)) body: UpdatePaymentInput,
  ) {
    return this.payments.update(org.organizationId, id, body);
  }

  @Post(':id/allocations')
  @Idempotent()
  @RequirePermission(Permission.PAYMENTS_WRITE)
  @ResponseMessage('Payment allocated')
  allocate(
    @CurrentOrg() org: OrgAccess,
    @Param('id', IdParam) id: string,
    @Body(new ZodValidationPipe(allocatePaymentSchema)) body: AllocatePaymentInput,
  ) {
    return this.payments.allocate(org.organizationId, id, body.allocations);
  }

  @Get(':id/allocations')
  @RequirePermission(Permission.PAYMENTS_READ)
  async allocations(@CurrentOrg() org: OrgAccess, @Param('id', IdParam) id: string) {
    return (await this.payments.getDetailed(org.organizationId, id)).allocations;
  }

  @Post(':id/reversals')
  @Idempotent()
  @RequirePermission(Permission.PAYMENTS_REVERSE)
  @ResponseMessage('Reversal recorded')
  reverse(
    @CurrentOrg() org: OrgAccess,
    @Param('id', IdParam) id: string,
    @Body(new ZodValidationPipe(reversePaymentSchema)) body: ReversePaymentInput,
  ) {
    return this.payments.reverse(org.organizationId, id, body);
  }

  @Get(':id/history')
  @RequirePermission(Permission.PAYMENTS_READ)
  history(@CurrentOrg() org: OrgAccess, @Param('id', IdParam) id: string) {
    return this.payments.history(org.organizationId, id);
  }
}

@ApiTags('invoices')
@ApiBearerAuth()
@ApiSecurity('organization')
@Controller('invoices')
export class InvoicePaymentsController {
  constructor(
    private readonly payments: PaymentsService,
    private readonly invoices: InvoicesService,
  ) {}

  @Get(':id/payments')
  @RequirePermission(Permission.INVOICES_READ)
  async list(@CurrentOrg() org: OrgAccess, @Param('id', IdParam) id: string) {
    await this.invoices.get(org.organizationId, id);
    return this.payments.listAllocationsForInvoice(org.organizationId, id);
  }
}

@ApiTags('customers')
@ApiBearerAuth()
@ApiSecurity('organization')
@Controller('customers')
export class CustomerAccountsController {
  constructor(
    private readonly accounts: CustomerAccountsService,
    private readonly invoices: InvoicesService,
    private readonly payments: PaymentsService,
  ) {}

  @Get(':id/summary')
  @RequirePermission(Permission.CUSTOMERS_READ)
  summary(@CurrentOrg() org: OrgAccess, @Param('id', IdParam) id: string) {
    return this.accounts.summary(org.organizationId, id);
  }

  @Get(':id/invoices')
  @RequirePermission(Permission.INVOICES_READ)
  invoicesOf(
    @CurrentOrg() org: OrgAccess,
    @Param('id', IdParam) id: string,
    @Query(new ZodValidationPipe(listInvoicesQuerySchema)) query: ListInvoicesQuery,
  ) {
    return this.invoices.list(org.organizationId, { ...query, customerId: id });
  }

  @Get(':id/payments')
  @RequirePermission(Permission.PAYMENTS_READ)
  paymentsOf(
    @CurrentOrg() org: OrgAccess,
    @Param('id', IdParam) id: string,
    @Query(new ZodValidationPipe(listPaymentsQuerySchema)) query: ListPaymentsQuery,
  ) {
    return this.payments.list(org.organizationId, { ...query, customerId: id });
  }
}
