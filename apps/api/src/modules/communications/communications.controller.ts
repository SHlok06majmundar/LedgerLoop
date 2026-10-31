import { Body, Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { InvoiceStatus, Permission } from '@ledgerloop/shared-types';
import { idSchema, sendInvoiceSchema, type SendInvoiceInput } from '@ledgerloop/validation';
import {
  CurrentOrg,
  RequirePermission,
  type OrgAccess,
} from '../../common/decorators/organization.decorator';
import { ResponseMessage } from '../../common/decorators/response-message.decorator';
import { unprocessable } from '../../common/errors/app-exception';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { InvoicesService } from '../invoices/invoices.service';
import {
  CommunicationsService,
  listCommunicationsQuerySchema,
  type ListCommunicationsQuery,
} from './communications.service';
import { CommunicationKind } from './communication.schema';

const IdParam = new ZodValidationPipe(idSchema);

@ApiTags('communications')
@ApiBearerAuth()
@ApiSecurity('organization')
@Controller('communications')
export class CommunicationsController {
  constructor(private readonly communications: CommunicationsService) {}

  @Get()
  @RequirePermission(Permission.CUSTOMERS_READ)
  list(
    @CurrentOrg() org: OrgAccess,
    @Query(new ZodValidationPipe(listCommunicationsQuerySchema)) query: ListCommunicationsQuery,
  ) {
    return this.communications.list(org.organizationId, query);
  }

  @Post(':id/retry')
  @HttpCode(200)
  @RequirePermission(Permission.COLLECTIONS_MANAGE)
  @ResponseMessage('Email queued for retry')
  retry(@CurrentOrg() org: OrgAccess, @Param('id', IdParam) id: string) {
    return this.communications.retry(org.organizationId, id);
  }

  @Post(':id/cancel')
  @HttpCode(200)
  @RequirePermission(Permission.COLLECTIONS_MANAGE)
  @ResponseMessage('Email cancelled')
  cancel(@CurrentOrg() org: OrgAccess, @Param('id', IdParam) id: string) {
    return this.communications.cancel(org.organizationId, id);
  }
}

@ApiTags('invoices')
@ApiBearerAuth()
@ApiSecurity('organization')
@Controller('invoices')
export class InvoiceSendController {
  constructor(
    private readonly communications: CommunicationsService,
    private readonly invoices: InvoicesService,
  ) {}

  @Post(':id/send')
  @HttpCode(202)
  @RequirePermission(Permission.INVOICES_ISSUE)
  @ResponseMessage('Invoice email queued')
  async send(
    @CurrentOrg() org: OrgAccess,
    @Param('id', IdParam) id: string,
    @Body(new ZodValidationPipe(sendInvoiceSchema)) body: SendInvoiceInput,
  ) {
    const invoice = await this.invoices.get(org.organizationId, id);
    if (invoice.status === InvoiceStatus.DRAFT || invoice.status === InvoiceStatus.VOID) {
      throw unprocessable('INVOICE_NOT_SENDABLE', 'Issue the invoice before sending it');
    }
    return this.communications.schedule(org.organizationId, {
      customerId: invoice.customerId.toString(),
      invoiceIds: [id],
      kind: CommunicationKind.INVOICE,
      to: body.to,
      message: body.message,
    });
  }
}
