'use client';

import { useQuery } from '@tanstack/react-query';
import { Download, GitCompareArrows } from 'lucide-react';
import Link from 'next/link';
import { use } from 'react';
import { PageHeader } from '@/components/app/page-header';
import { StatTile } from '@/components/app/stat-tile';
import { StatusBadge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { ErrorState, Skeleton } from '@/components/ui/feedback';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { api, download } from '@/lib/api';
import { applyApiError } from '@/lib/auth';
import { dateTime } from '@/lib/format';
import { useOrgQueryKey } from '@/lib/hooks';
import type { ImportJob } from '@/lib/types';

const ACTIVE = ['QUEUED', 'PROCESSING'];

export default function ImportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const job = useQuery({
    queryKey: useOrgQueryKey('imports', id),
    queryFn: () => api<ImportJob>(`/bank-imports/${id}`),
    // Poll while the worker runs; socket updates also refresh this query.
    refetchInterval: (q) => (q.state.data && ACTIVE.includes(q.state.data.status) ? 1500 : false),
  });

  if (job.isPending) return <Skeleton className="h-64" />;
  if (job.isError) return <ErrorState message={job.error.message} />;
  const j = job.data;
  const running = ACTIVE.includes(j.status);
  const percent = j.totalRows ? Math.round((j.processedRows / j.totalRows) * 100) : 0;

  return (
    <>
      <PageHeader
        back={{ href: '/reconciliation/imports', label: 'Imports' }}
        title={
          <span className="flex items-center gap-3">
            {j.fileName} <StatusBadge status={j.status} />
          </span>
        }
        description={`Uploaded ${dateTime(j.createdAt)}${j.completedAt ? ` · finished ${dateTime(j.completedAt)}` : ''}`}
        actions={
          j.status === 'COMPLETED' && (
            <Button asChild>
              <Link href="/reconciliation">
                <GitCompareArrows /> Review matches
              </Link>
            </Button>
          )
        }
      />

      {running && (
        <Card className="mb-6 p-5">
          <div className="flex justify-between text-sm">
            <span>Processing rows…</span>
            <span className="tabular">{percent}%</span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}>
            <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${percent}%` }} />
          </div>
        </Card>
      )}
      {j.status === 'FAILED' && (
        <div className="mb-6 rounded-lg border border-danger/30 bg-danger-soft px-4 py-3 text-sm text-danger">
          The import failed: {j.failureReason}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile label="Rows in file" value={j.totalRows} />
        <StatTile label="Imported" tone="success" value={j.importedRows} />
        <StatTile label="Already imported" value={j.duplicateRows} hint="Skipped as duplicates" />
        <StatTile label="Failed rows" tone={j.failedRows ? 'danger' : 'default'} value={j.failedRows} />
      </div>

      {j.rowErrors.length > 0 && (
        <Card className="mt-6">
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>Rows that could not be imported</CardTitle>
            <Button
              size="sm"
              variant="outline"
              onClick={() => download(`/bank-imports/${id}/errors?format=csv`, 'import-errors.csv').catch(applyApiError)}
            >
              <Download /> Error report
            </Button>
          </CardHeader>
          <Table>
            <THead>
              <TR>
                <TH className="w-24">Line</TH>
                <TH>Problem</TH>
              </TR>
            </THead>
            <TBody>
              {j.rowErrors.map((e) => (
                <TR key={e.row}>
                  <TD className="tabular">{e.row}</TD>
                  <TD className="text-danger">{e.message}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </Card>
      )}
    </>
  );
}
