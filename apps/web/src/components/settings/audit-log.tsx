'use client';

import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Pagination } from '@/components/app/list';
import { Card } from '@/components/ui/card';
import { TableSkeleton } from '@/components/ui/feedback';
import { NativeSelect } from '@/components/ui/input';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { apiPage } from '@/lib/api';
import { dateTime } from '@/lib/format';
import { useOrgQueryKey } from '@/lib/hooks';

interface Entry {
  id: string;
  action: string;
  entityType: string;
  userId: { name: string; email: string } | null;
  requestId?: string;
  createdAt: string;
}

const TYPES = ['', 'Invoice', 'Payment', 'Customer', 'BankTransaction', 'Membership', 'Organization', 'ReconciliationException'];

export function AuditLog() {
  const [entityType, setEntityType] = useState('');
  const [page, setPage] = useState(1);
  const logs = useQuery({
    queryKey: useOrgQueryKey('audit', entityType, page),
    queryFn: () => apiPage<Entry>('/audit-logs', { query: { entityType, page, limit: 30 } }),
    placeholderData: (prev) => prev,
  });

  return (
    <Card>
      <div className="flex items-center justify-between gap-3 border-b p-4">
        <p className="text-sm text-muted-foreground">Append-only record of every change to financial and access data.</p>
        <NativeSelect
          aria-label="Record type"
          className="w-52"
          value={entityType}
          onChange={(e) => {
            setEntityType(e.target.value);
            setPage(1);
          }}
        >
          {TYPES.map((t) => (
            <option key={t} value={t}>
              {t || 'All records'}
            </option>
          ))}
        </NativeSelect>
      </div>
      {logs.isPending ? (
        <TableSkeleton cols={4} />
      ) : (
        <>
          <Table>
            <THead>
              <TR>
                <TH>When</TH>
                <TH>Who</TH>
                <TH>Action</TH>
                <TH>Request</TH>
              </TR>
            </THead>
            <TBody>
              {logs.data?.items.map((e) => (
                <TR key={e.id}>
                  <TD className="whitespace-nowrap text-muted-foreground">{dateTime(e.createdAt)}</TD>
                  <TD>{e.userId?.name ?? 'System'}</TD>
                  <TD className="font-mono text-xs">{e.action}</TD>
                  <TD className="max-w-40 truncate font-mono text-xs text-muted-foreground">{e.requestId}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
          <Pagination meta={logs.data?.meta} onPage={setPage} />
        </>
      )}
    </Card>
  );
}
