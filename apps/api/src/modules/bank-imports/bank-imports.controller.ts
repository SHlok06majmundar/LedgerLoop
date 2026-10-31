import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { Permission } from '@ledgerloop/shared-types';
import {
  confirmImportSchema,
  idSchema,
  listBankTransactionsQuerySchema,
  paginationQuerySchema,
  type ConfirmImportInput,
  type ListBankTransactionsQuery,
  type PaginationQuery,
} from '@ledgerloop/validation';
import {
  CurrentOrg,
  RequirePermission,
  type OrgAccess,
} from '../../common/decorators/organization.decorator';
import { ResponseMessage } from '../../common/decorators/response-message.decorator';
import { unprocessable } from '../../common/errors/app-exception';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { BankImportsService } from './bank-imports.service';

const IdParam = new ZodValidationPipe(idSchema);

@ApiTags('bank-imports')
@ApiBearerAuth()
@ApiSecurity('organization')
@Controller('bank-imports')
export class BankImportsController {
  constructor(private readonly imports: BankImportsService) {}

  @Post()
  @RequirePermission(Permission.IMPORTS_WRITE)
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 50 * 1024 * 1024 } }))
  @ResponseMessage('Statement uploaded. Confirm the column mapping to import it.')
  upload(@CurrentOrg() org: OrgAccess, @UploadedFile() file: Express.Multer.File | undefined) {
    if (!file) throw unprocessable('FILE_REQUIRED', 'Attach the statement in the "file" field');
    return this.imports.upload(org.organizationId, file);
  }

  @Get()
  @RequirePermission(Permission.RECONCILIATION_READ)
  list(
    @CurrentOrg() org: OrgAccess,
    @Query(new ZodValidationPipe(paginationQuerySchema)) query: PaginationQuery,
  ) {
    return this.imports.list(org.organizationId, query);
  }

  @Get(':id')
  @RequirePermission(Permission.RECONCILIATION_READ)
  get(@CurrentOrg() org: OrgAccess, @Param('id', IdParam) id: string) {
    return this.imports.get(org.organizationId, id);
  }

  @Post(':id/confirm')
  @HttpCode(200)
  @RequirePermission(Permission.IMPORTS_WRITE)
  @ResponseMessage('Import queued')
  confirm(
    @CurrentOrg() org: OrgAccess,
    @Param('id', IdParam) id: string,
    @Body(new ZodValidationPipe(confirmImportSchema)) body: ConfirmImportInput,
  ) {
    return this.imports.confirm(org.organizationId, id, body);
  }

  @Get(':id/progress')
  @RequirePermission(Permission.RECONCILIATION_READ)
  progress(@CurrentOrg() org: OrgAccess, @Param('id', IdParam) id: string) {
    return this.imports.progress(org.organizationId, id);
  }

  @Get(':id/errors')
  @RequirePermission(Permission.RECONCILIATION_READ)
  async errors(
    @CurrentOrg() org: OrgAccess,
    @Param('id', IdParam) id: string,
    @Query('format') format?: string,
  ) {
    const report = await this.imports.errorReport(org.organizationId, id);
    if (format === 'csv') {
      return new StreamableFile(report.csv, {
        type: 'text/csv; charset=utf-8',
        disposition: `attachment; filename="${report.fileName.replace(/"/g, '')}"`,
      });
    }
    return report.rows;
  }
}

@ApiTags('bank-transactions')
@ApiBearerAuth()
@ApiSecurity('organization')
@Controller('bank-transactions')
export class BankTransactionsController {
  constructor(private readonly imports: BankImportsService) {}

  @Get()
  @RequirePermission(Permission.RECONCILIATION_READ)
  list(
    @CurrentOrg() org: OrgAccess,
    @Query(new ZodValidationPipe(listBankTransactionsQuerySchema)) query: ListBankTransactionsQuery,
  ) {
    return this.imports.listTransactions(org.organizationId, query);
  }

  @Get(':id')
  @RequirePermission(Permission.RECONCILIATION_READ)
  get(@CurrentOrg() org: OrgAccess, @Param('id', IdParam) id: string) {
    return this.imports.getTransaction(org.organizationId, id);
  }
}
