'use client';

import { useQuery } from '@tanstack/react-query';
import { FileSpreadsheet, Upload } from 'lucide-react';
import Link from 'next/link';
import { PageHeader } from '@/components/app/page-header';
import { StatusBadge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState, TableSkeleton } from '@/components/ui/feedback';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { apiPage } from '@/lib/api';
import { dateTime } from '@/lib/format';
import { useOrgQueryKey } from '@/lib/hooks';
import type { ImportJob } from '@/lib/types';

export default function ImportsPage() {
  const imports = useQuery({
    queryKey: useOrgQueryKey('imports'),
    queryFn: () => apiPage<ImportJob>('/bank-imports', { query: { limit: 50 } }),
  });

  return (
    <>
      <PageHeader
        back={{ href: '/reconciliation', label: 'Reconciliation' }}
        title="Statement imports"
        description="Every bank statement you have uploaded and what happened to it."
        actions={
          <Button asChild>
            <Link href="/reconciliation/imports/new">
              <Upload /> Import statement
            </Link>
          </Button>
        }
      />
      <Card>
        {imports.isPending ? (
          <TableSkeleton />
        ) : imports.data?.items.length ? (
          <Table>
            <THead>
              <TR>
                <TH>File</TH>
                <TH>Uploaded</TH>
                <TH>Status</TH>
                <TH className="text-right">Imported</TH>
                <TH className="text-right">Duplicates</TH>
                <TH className="text-right">Failed</TH>
              </TR>
            </THead>
            <TBody>
              {imports.data.items.map((job) => (
                <TR key={job.id}>
                  <TD>
                    <Link href={`/reconciliation/imports/${job.id}`} className="font-medium text-primary hover:underline">
                      {job.fileName}
                    </Link>
                  </TD>
                  <TD className="text-muted-foreground">{dateTime(job.createdAt)}</TD>
                  <TD>
                    <StatusBadge status={job.status} />
                  </TD>
                  <TD className="text-right tabular">{job.importedRows}</TD>
                  <TD className="text-right tabular">{job.duplicateRows}</TD>
                  <TD className={`text-right tabular ${job.failedRows ? 'text-danger' : ''}`}>{job.failedRows}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        ) : (
          <EmptyState icon={FileSpreadsheet} title="No statements imported yet" description="Download a CSV statement from your net banking and upload it here." />
        )}
      </Card>
    </>
  );
}
