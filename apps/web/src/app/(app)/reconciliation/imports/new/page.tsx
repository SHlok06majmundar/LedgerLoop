'use client';

import { useMutation } from '@tanstack/react-query';
import { FileSpreadsheet, UploadCloud } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/app/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, NativeSelect } from '@/components/ui/input';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { api } from '@/lib/api';
import { applyApiError } from '@/lib/auth';
import type { ImportJob } from '@/lib/types';
import { cn } from '@/lib/utils';

const DATE_FORMATS = ['DD/MM/YYYY', 'DD-MM-YYYY', 'DD-MMM-YYYY', 'YYYY-MM-DD', 'MM/DD/YYYY'];
type Mapping = { date: string; description: string; reference: string; amount: string; debit: string; credit: string };

export default function NewImportPage() {
  const router = useRouter();
  const [job, setJob] = useState<ImportJob | null>(null);
  const [dragging, setDragging] = useState(false);
  const [mode, setMode] = useState<'split' | 'single'>('split');
  const [mapping, setMapping] = useState<Mapping>({ date: '', description: '', reference: '', amount: '', debit: '', credit: '' });
  const [dateFormat, setDateFormat] = useState('DD/MM/YYYY');

  const upload = useMutation({
    mutationFn: (file: File) => {
      const form = new FormData();
      form.append('file', file);
      return api<ImportJob>('/bank-imports', { method: 'POST', body: form });
    },
    onSuccess: (created) => {
      setJob(created);
      const s = created.suggestedMapping;
      setMode(s.amount && !s.debit ? 'single' : 'split');
      setMapping({
        date: s.date ?? '',
        description: s.description ?? '',
        reference: s.reference ?? '',
        amount: s.amount ?? '',
        debit: s.debit ?? '',
        credit: s.credit ?? '',
      });
    },
    onError: (e) => applyApiError(e),
  });

  const confirm = useMutation({
    mutationFn: () => {
      const body = {
        dateFormat,
        mapping: {
          date: mapping.date,
          description: mapping.description,
          reference: mapping.reference || undefined,
          ...(mode === 'single' ? { amount: mapping.amount } : { debit: mapping.debit, credit: mapping.credit }),
        },
      };
      return api(`/bank-imports/${job!.id}/confirm`, { method: 'POST', body });
    },
    onSuccess: () => {
      toast.success('Import started');
      router.push(`/reconciliation/imports/${job!.id}`);
    },
    onError: (e) => applyApiError(e),
  });

  const pick = (files: FileList | null) => {
    const file = files?.[0];
    if (file) upload.mutate(file);
  };

  const columnSelect = (field: keyof Mapping, label: string, optional = false) => (
    <Field label={label} htmlFor={`map-${field}`}>
      <NativeSelect id={`map-${field}`} value={mapping[field]} onChange={(e) => setMapping((m) => ({ ...m, [field]: e.target.value }))}>
        <option value="">{optional ? 'Not in this file' : 'Choose column…'}</option>
        {job!.headers.filter(Boolean).map((h) => (
          <option key={h} value={h}>
            {h}
          </option>
        ))}
      </NativeSelect>
    </Field>
  );

  const ready =
    mapping.date &&
    mapping.description &&
    (mode === 'single' ? mapping.amount : mapping.debit && mapping.credit);

  return (
    <>
      <PageHeader back={{ href: '/reconciliation/imports', label: 'Imports' }} title="Import bank statement" />
      {!job ? (
        <Card>
          <label
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              pick(e.dataTransfer.files);
            }}
            className={cn(
              'm-5 flex cursor-pointer flex-col items-center gap-3 rounded-xl border-2 border-dashed px-6 py-16 text-center transition-colors',
              dragging ? 'border-primary bg-primary-soft' : 'hover:bg-muted/50',
            )}
          >
            <UploadCloud className="size-10 text-primary" />
            <span className="font-medium">{upload.isPending ? 'Reading your statement…' : 'Drop a CSV statement here, or click to choose'}</span>
            <span className="max-w-md text-sm text-muted-foreground">
              Most Indian banks (HDFC, ICICI, SBI, Axis, Kotak) export CSV from net banking. We detect the header row and
              columns for you, and skip lines you have already imported.
            </span>
            <input type="file" accept=".csv,.txt,text/csv" className="sr-only" disabled={upload.isPending} onChange={(e) => pick(e.target.files)} />
          </label>
        </Card>
      ) : (
        <div className="grid gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileSpreadsheet className="size-4 text-primary" /> {job.fileName}
              </CardTitle>
              <CardDescription>
                {job.totalRows} rows found starting at line {job.headerRow + 1}. Check the columns below.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4">
              <div className="flex gap-2">
                {(['split', 'single'] as const).map((m) => (
                  <Button key={m} size="sm" variant={mode === m ? 'default' : 'outline'} onClick={() => setMode(m)}>
                    {m === 'split' ? 'Separate debit and credit columns' : 'One signed amount column'}
                  </Button>
                ))}
              </div>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {columnSelect('date', 'Date column')}
                <Field label="Date format" htmlFor="date-format">
                  <NativeSelect id="date-format" value={dateFormat} onChange={(e) => setDateFormat(e.target.value)}>
                    {DATE_FORMATS.map((f) => (
                      <option key={f}>{f}</option>
                    ))}
                  </NativeSelect>
                </Field>
                {columnSelect('description', 'Narration column')}
                {columnSelect('reference', 'Reference column', true)}
                {mode === 'single' ? (
                  columnSelect('amount', 'Amount column')
                ) : (
                  <>
                    {columnSelect('debit', 'Withdrawal (debit) column')}
                    {columnSelect('credit', 'Deposit (credit) column')}
                  </>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Preview</CardTitle>
              <CardDescription>The first rows as they will be read.</CardDescription>
            </CardHeader>
            <Table>
              <THead>
                <TR>
                  {job.headers.filter(Boolean).map((h) => (
                    <TH key={h} className={cn(Object.values(mapping).includes(h) && 'text-primary')}>
                      {h}
                    </TH>
                  ))}
                </TR>
              </THead>
              <TBody>
                {job.preview.map((row, i) => (
                  <TR key={i}>
                    {job.headers.filter(Boolean).map((h) => (
                      <TD key={h} className="max-w-56 truncate font-mono text-xs">
                        {row[h]}
                      </TD>
                    ))}
                  </TR>
                ))}
              </TBody>
            </Table>
          </Card>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setJob(null)}>
              Choose another file
            </Button>
            <Button disabled={!ready} loading={confirm.isPending} onClick={() => confirm.mutate()}>
              Import {job.totalRows} rows
            </Button>
          </div>
        </div>
      )}
    </>
  );
}
