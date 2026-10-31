import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { Permission } from '@ledgerloop/shared-types';
import {
  createCustomerSchema,
  idSchema,
  listCustomersQuerySchema,
  updateCustomerSchema,
  type CreateCustomerInput,
  type ListCustomersQuery,
  type UpdateCustomerInput,
} from '@ledgerloop/validation';
import {
  CurrentOrg,
  RequirePermission,
  type OrgAccess,
} from '../../common/decorators/organization.decorator';
import { ResponseMessage } from '../../common/decorators/response-message.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { CustomersService } from './customers.service';

const IdParam = new ZodValidationPipe(idSchema);

@ApiTags('customers')
@ApiBearerAuth()
@ApiSecurity('organization')
@Controller('customers')
export class CustomersController {
  constructor(private readonly customers: CustomersService) {}

  @Post()
  @RequirePermission(Permission.CUSTOMERS_WRITE)
  @ResponseMessage('Customer created')
  create(
    @CurrentOrg() org: OrgAccess,
    @Body(new ZodValidationPipe(createCustomerSchema)) body: CreateCustomerInput,
  ) {
    return this.customers.create(org.organizationId, body);
  }

  @Get()
  @RequirePermission(Permission.CUSTOMERS_READ)
  list(
    @CurrentOrg() org: OrgAccess,
    @Query(new ZodValidationPipe(listCustomersQuerySchema)) query: ListCustomersQuery,
  ) {
    return this.customers.list(org.organizationId, query);
  }

  @Get(':id')
  @RequirePermission(Permission.CUSTOMERS_READ)
  get(@CurrentOrg() org: OrgAccess, @Param('id', IdParam) id: string) {
    return this.customers.get(org.organizationId, id);
  }

  @Patch(':id')
  @RequirePermission(Permission.CUSTOMERS_WRITE)
  @ResponseMessage('Customer updated')
  update(
    @CurrentOrg() org: OrgAccess,
    @Param('id', IdParam) id: string,
    @Body(new ZodValidationPipe(updateCustomerSchema)) body: UpdateCustomerInput,
  ) {
    return this.customers.update(org.organizationId, id, body);
  }

  @Delete(':id')
  @RequirePermission(Permission.CUSTOMERS_WRITE)
  @ResponseMessage('Customer archived')
  archive(@CurrentOrg() org: OrgAccess, @Param('id', IdParam) id: string) {
    return this.customers.archive(org.organizationId, id);
  }

  @Post(':id/restore')
  @RequirePermission(Permission.CUSTOMERS_WRITE)
  @ResponseMessage('Customer restored')
  restore(@CurrentOrg() org: OrgAccess, @Param('id', IdParam) id: string) {
    return this.customers.restore(org.organizationId, id);
  }
}
