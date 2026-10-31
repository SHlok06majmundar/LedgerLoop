import { z } from 'zod';
import { dateRangeQuerySchema, idSchema, paginationQuerySchema } from './common';

export const statementDateFormatSchema = z.enum([
  'DD/MM/YYYY',
  'DD-MM-YYYY',
  'YYYY-MM-DD',
  'MM/DD/YYYY',
  'DD-MMM-YYYY',
]);

const column = z.string().trim().min(1).max(100);

export const columnMappingSchema = z
  .object({
    date: column,
    description: column,
    reference: column.optional(),
    amount: column.optional(),
    debit: column.optional(),
    credit: column.optional(),
  })
  .refine((m) => Boolean(m.amount) !== Boolean(m.debit && m.credit), {
    message: 'Map either one amount column, or both debit and credit columns',
    path: ['amount'],
  });
export type ColumnMappingInput = z.infer<typeof columnMappingSchema>;

export const confirmImportSchema = z.object({
  mapping: columnMappingSchema,
  dateFormat: statementDateFormatSchema,
  /** 1-based row holding the column headers; defaults to the detected row. */
  headerRow: z.number().int().min(1).max(100).optional(),
});
export type ConfirmImportInput = z.infer<typeof confirmImportSchema>;

export const listBankTransactionsQuerySchema = paginationQuerySchema
  .merge(dateRangeQuerySchema)
  .extend({
    status: z
      .enum([
        'UNMATCHED',
        'SUGGESTED',
        'MATCHED',
        'PARTIALLY_MATCHED',
        'DISCREPANCY',
        'REJECTED',
        'IGNORED',
      ])
      .optional(),
    direction: z.enum(['CREDIT', 'DEBIT']).optional(),
    importJobId: idSchema.optional(),
  });
export type ListBankTransactionsQuery = z.infer<typeof listBankTransactionsQuerySchema>;
