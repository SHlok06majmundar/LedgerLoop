import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ImportJobStatus, ReconciliationStatus } from '@ledgerloop/shared-types';
import type { ConfirmImportInput, ListBankTransactionsQuery } from '@ledgerloop/validation';
import { parse } from 'csv-parse/sync';
import { Types, mongo, type FilterQuery, type Model } from 'mongoose';
import { RequestContext } from '../../common/context/request-context';
import { notFound, unprocessable } from '../../common/errors/app-exception';
import { sha256 } from '../../common/utils/crypto';
import { AppConfig } from '../../config/app-config.service';
import { paginate } from '../../database/paginate';
import { JobQueue } from '../../jobs/job-queue.service';
import { FileStorage, storageKeys } from '../../storage/file-storage';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import {
  detectHeaderRow,
  fingerprintParts,
  normalizeRow,
  suggestMapping,
  type ColumnMapping,
  type DateFormat,
} from './domain/statement-parsing';
import { BankTransaction } from './schemas/bank-transaction.schema';
import { ImportJob, type RowError } from './schemas/import-job.schema';

export const PROCESS_IMPORT_JOB = 'bank-imports.process';
export const RECONCILE_JOB = 'reconciliation.run';

const BATCH_SIZE = 500;
const STORED_ERRORS = 200;
const ALLOWED_TYPES = [
  'text/csv',
  'text/plain',
  'application/vnd.ms-excel',
  'application/octet-stream',
];

interface UploadedStatement {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

@Injectable()
export class BankImportsService implements OnModuleInit {
  private readonly logger = new Logger(BankImportsService.name);

  constructor(
    @InjectModel(ImportJob.name) private readonly jobs: Model<ImportJob>,
    @InjectModel(BankTransaction.name) private readonly transactions: Model<BankTransaction>,
    private readonly storage: FileStorage,
    private readonly queue: JobQueue,
    private readonly audit: AuditLogsService,
    private readonly config: AppConfig,
  ) {}

  onModuleInit() {
    this.queue.register(PROCESS_IMPORT_JOB, (payload) =>
      this.process(payload.importJobId as string),
    );
  }

  /** Stores the original file and returns headers, preview and a suggested mapping. */
  async upload(organizationId: string, file: UploadedStatement) {
    const maxBytes = this.config.get('MAX_UPLOAD_MB') * 1024 * 1024;
    if (file.size > maxBytes) {
      throw unprocessable(
        'FILE_TOO_LARGE',
        `Statements can be up to ${this.config.get('MAX_UPLOAD_MB')} MB`,
      );
    }
    const rows = this.readRows(file);
    const headerIndex = detectHeaderRow(rows);
    const headers = rows[headerIndex]!.map((h) => h.trim());
    const preview = dataRows(rows, headerIndex)
      .slice(0, 5)
      .map(({ cells }) => toRecord(headers, cells));

    const id = new Types.ObjectId();
    const fileKey = storageKeys.statement(organizationId, id.toString());
    await this.storage.put(fileKey, file.buffer, 'text/csv');
    const job = await this.jobs.create({
      _id: id,
      organizationId,
      fileName: file.originalname.slice(0, 200),
      fileKey,
      fileSize: file.size,
      status: ImportJobStatus.AWAITING_MAPPING,
      headerRow: headerIndex + 1,
      headers,
      suggestedMapping: suggestMapping(headers),
      preview,
      totalRows: dataRows(rows, headerIndex).length,
      createdBy: actor(),
    });
    await this.audit.record({
      organizationId,
      action: 'bank_import.uploaded',
      entityType: 'ImportJob',
      entityId: job._id,
      after: { fileName: job.fileName, totalRows: job.totalRows },
    });
    return job;
  }

  /** Saves the column mapping and queues the import for the worker. */
  async confirm(organizationId: string, importJobId: string, input: ConfirmImportInput) {
    const job = await this.get(organizationId, importJobId);
    if (job.status !== ImportJobStatus.AWAITING_MAPPING) {
      throw unprocessable('IMPORT_ALREADY_CONFIRMED', 'This import is already being processed');
    }
    const headerRow = input.headerRow ?? job.headerRow;
    const missing = Object.values(input.mapping).filter((col) => col && !job.headers.includes(col));
    if (input.headerRow === undefined && missing.length > 0) {
      throw unprocessable(
        'UNKNOWN_COLUMNS',
        `Columns not found in the file: ${missing.join(', ')}`,
      );
    }
    job.set({
      mapping: input.mapping,
      dateFormat: input.dateFormat,
      headerRow,
      status: ImportJobStatus.QUEUED,
    });
    await job.save();
    await this.queue.enqueue(
      PROCESS_IMPORT_JOB,
      { importJobId },
      { dedupeKey: `import:${importJobId}` },
    );
    return job;
  }

  /** Worker: parses, normalizes and stores every row, skipping duplicates. */
  async process(importJobId: string): Promise<void> {
    const job = await this.jobs.findById(importJobId).exec();
    if (
      !job ||
      ![ImportJobStatus.QUEUED, ImportJobStatus.PROCESSING].includes(job.status as never)
    ) {
      return;
    }
    const organizationId = job.organizationId.toString();
    job.set({
      status: ImportJobStatus.PROCESSING,
      startedAt: new Date(),
      processedRows: 0,
      importedRows: 0,
      duplicateRows: 0,
      failedRows: 0,
      rowErrors: [],
    });
    await job.save();

    try {
      const file = await this.storage.get(job.fileKey);
      if (!file) throw new Error('Uploaded statement file is missing');
      const rows = parseCsv(file.data);
      const headerIndex = job.headerRow - 1;
      const headers = (rows[headerIndex] ?? []).map((h) => h.trim());
      const lines = dataRows(rows, headerIndex);
      const mapping = job.mapping as unknown as ColumnMapping;
      const errors: RowError[] = [];
      const seen = new Map<string, number>();
      let batch: Record<string, unknown>[] = [];
      const counters = { imported: 0, duplicates: 0, processed: 0 };

      const flush = async () => {
        if (batch.length === 0) return;
        const { inserted, duplicates } = await this.insertBatch(batch);
        counters.imported += inserted;
        counters.duplicates += duplicates;
        batch = [];
        await this.jobs.updateOne(
          { _id: job._id },
          {
            processedRows: counters.processed,
            importedRows: counters.imported,
            duplicateRows: counters.duplicates,
            failedRows: errors.length,
          },
        );
      };

      for (const { cells, line } of lines) {
        counters.processed++;
        const raw = toRecord(headers, cells);
        const result = normalizeRow(raw, mapping, job.dateFormat as DateFormat);
        if (!result.ok) {
          errors.push({ row: line, message: result.error, raw });
          continue;
        }
        const parts = fingerprintParts(result.value, 0);
        const occurrence = seen.get(parts) ?? 0;
        seen.set(parts, occurrence + 1);
        batch.push({
          organizationId: job.organizationId,
          importJobId: job._id,
          rowNumber: line,
          ...result.value,
          fingerprint: sha256(`${organizationId}|${fingerprintParts(result.value, occurrence)}`),
          status:
            result.value.direction === 'DEBIT'
              ? ReconciliationStatus.IGNORED
              : ReconciliationStatus.UNMATCHED,
        });
        if (batch.length >= BATCH_SIZE) await flush();
      }
      await flush();

      if (errors.length > 0) {
        const key = storageKeys.importErrors(organizationId, importJobId);
        await this.storage.put(key, Buffer.from(errorReport(errors)), 'text/csv');
        job.errorReportKey = key;
      }
      job.set({
        status: ImportJobStatus.COMPLETED,
        totalRows: lines.length,
        processedRows: counters.processed,
        importedRows: counters.imported,
        duplicateRows: counters.duplicates,
        failedRows: errors.length,
        rowErrors: errors.slice(0, STORED_ERRORS),
        completedAt: new Date(),
      });
      await job.save();
      await this.audit.record({
        organizationId,
        userId: job.createdBy?.toString() ?? null,
        action: 'bank_import.completed',
        entityType: 'ImportJob',
        entityId: job._id,
        after: {
          imported: counters.imported,
          duplicates: counters.duplicates,
          failed: errors.length,
        },
      });
      if (counters.imported > 0) {
        await this.queue.enqueue(
          RECONCILE_JOB,
          { organizationId, trigger: 'IMPORT', importJobId },
          { dedupeKey: `reconcile:${organizationId}` },
        );
      }
    } catch (err) {
      this.logger.error(`Import ${importJobId} failed`, err as Error);
      await this.jobs.updateOne(
        { _id: job._id },
        {
          status: ImportJobStatus.FAILED,
          failureReason: (err as Error).message,
          completedAt: new Date(),
        },
      );
    }
  }

  list(organizationId: string, query: { page: number; limit: number; order: 'asc' | 'desc' }) {
    return paginate(this.jobs, { organizationId }, query, {
      defaultSort: 'createdAt',
      populate: { path: 'createdBy', select: 'name' },
    });
  }

  async get(organizationId: string, importJobId: string) {
    const job = await this.jobs.findOne({ _id: importJobId, organizationId }).exec();
    if (!job) throw notFound('Import');
    return job;
  }

  async progress(organizationId: string, importJobId: string) {
    const job = await this.get(organizationId, importJobId);
    return {
      status: job.status,
      totalRows: job.totalRows,
      processedRows: job.processedRows,
      importedRows: job.importedRows,
      duplicateRows: job.duplicateRows,
      failedRows: job.failedRows,
      percent: job.totalRows ? Math.round((job.processedRows / job.totalRows) * 100) : 0,
    };
  }

  async errorReport(organizationId: string, importJobId: string) {
    const job = await this.get(organizationId, importJobId);
    const file = job.errorReportKey ? await this.storage.get(job.errorReportKey) : null;
    return {
      rows: job.rowErrors,
      csv: file?.data ?? Buffer.from('row,error\n'),
      fileName: `${job.fileName}-errors.csv`,
    };
  }

  listTransactions(organizationId: string, query: ListBankTransactionsQuery) {
    const filter: FilterQuery<BankTransaction> = { organizationId };
    if (query.status) filter.status = query.status;
    if (query.direction) filter.direction = query.direction;
    if (query.importJobId) filter.importJobId = query.importJobId;
    if (query.from || query.to) {
      filter.transactionDate = {
        ...(query.from && { $gte: query.from }),
        ...(query.to && { $lte: query.to }),
      };
    }
    return paginate(this.transactions, filter, query, {
      searchFields: ['description', 'reference'],
      sortable: ['transactionDate', 'amountMinor', 'createdAt'],
      defaultSort: 'transactionDate',
    });
  }

  async getTransaction(organizationId: string, id: string) {
    const txn = await this.transactions.findOne({ _id: id, organizationId }).exec();
    if (!txn) throw notFound('Bank transaction');
    return txn;
  }

  private readRows(file: UploadedStatement): string[][] {
    const looksCsv =
      /\.(csv|txt)$/i.test(file.originalname) && ALLOWED_TYPES.includes(file.mimetype);
    let rows: string[][] = [];
    if (looksCsv && !file.buffer.includes(0)) {
      try {
        rows = parseCsv(file.buffer);
      } catch {
        rows = [];
      }
    }
    const header = rows[detectHeaderRow(rows)];
    if (!header || header.filter((h) => h.trim()).length < 2) {
      throw unprocessable(
        'INVALID_STATEMENT_FILE',
        'Upload the bank statement as a CSV file with a header row',
      );
    }
    return rows;
  }

  private async insertBatch(docs: Record<string, unknown>[]) {
    const now = new Date();
    const prepared = docs.map((d) => ({
      ...new this.transactions(d).toObject(),
      createdAt: now,
      updatedAt: now,
    }));
    try {
      const result = await this.transactions.collection.insertMany(prepared, { ordered: false });
      return { inserted: result.insertedCount, duplicates: 0 };
    } catch (err) {
      if (!(err instanceof mongo.MongoBulkWriteError)) throw err;
      const writeErrors = ([] as { code?: number }[]).concat(err.writeErrors as never);
      if (writeErrors.some((e) => e.code !== 11000)) throw err;
      return { inserted: err.result.insertedCount, duplicates: writeErrors.length };
    }
  }
}

function parseCsv(data: Buffer): string[][] {
  return parse(data, {
    bom: true,
    relax_column_count: true,
    relax_quotes: true,
    skip_empty_lines: false,
  }) as string[][];
}

/** Non-empty rows after the header, with their 1-based line numbers. */
function dataRows(rows: string[][], headerIndex: number) {
  return rows
    .map((cells, i) => ({ cells, line: i + 1 }))
    .slice(headerIndex + 1)
    .filter(({ cells }) => cells.some((c) => c.trim() !== ''));
}

function toRecord(headers: string[], cells: string[]): Record<string, string> {
  return Object.fromEntries(headers.map((h, i) => [h, (cells[i] ?? '').trim()]));
}

function errorReport(errors: RowError[]): string {
  const quote = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const lines = errors.map((e) =>
    [e.row, quote(e.message), quote(JSON.stringify(e.raw))].join(','),
  );
  return ['row,error,data', ...lines].join('\n') + '\n';
}

function actor(): Types.ObjectId | undefined {
  const userId = RequestContext.get()?.userId;
  return userId ? new Types.ObjectId(userId) : undefined;
}
