'use client';

import { Permission } from '@ledgerloop/shared-types';
import { useQuery } from '@tanstack/react-query';
import { FilePlus2, FileText } from 'lucide-react';
import Link from 'next/link';
import { Suspense } from 'react';
import { FilterTabs, Pagination, SearchInput, useListParams } from '@/components/app/list';
import { PageHeader } from '@/components/app/page-header';
import { InvoiceTable } from '@/components/invoices/invoice-table';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState, ErrorState, TableSkeleton } from '@/components/ui/feedback';
import { Input } from '@/components/ui/input';
import { apiPage } from '@/lib/api';
import { useCan, useOrgQueryKey } from '@/lib/hooks';
import type { Invoice } from '@/lib/types';

const DEFAULTS = { search: '', status: '', from: '', to: '' };
const STATUSES = [
  { value: '', label: 'All' },
  { value: 'OPEN', label: 'Open' },
  { value: 'OVERDUE', label: 'Overdue' },
  { value: 'PARTIALLY_PAID', label: 'Partially paid' },
  { value: 'PAID', label: 'Paid' },
  { value: 'DRAFT', label: 'Drafts' },
  { value: 'VOID', label: 'Void' },
];

function InvoicesList() {
  const canWrite = useCan(Permission.INVOICES_WRITE);
  const { values, page, set } = useListParams(DEFAULTS);
  const query = useQuery({
    queryKey: useOrgQueryKey('invoices', values, page),
    queryFn: () => apiPage<Invoice>('/invoices', { query: { ...values, page, limit: 20 } }),
    placeholderData: (prev) => prev,
  });

  return (
    <>
      <PageHeader
        title="Invoices"
        description="Issue, send and track every invoice to payment."
        actions={
          canWrite && (
            <Button asChild>
              <Link href="/invoices/new">
                <FilePlus2 /> New invoice
              </Link>
            </Button>
          )
        }
      />
      <Card>
        <div className="grid gap-3 border-b p-4">
          <FilterTabs value={values.status} options={STATUSES} onChange={(status) => set({ status })} />
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <SearchInput value={values.search} onChange={(search) => set({ search })} placeholder="Search invoice number or customer" />
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Input type="date" aria-label="Issued from" value={values.from} onChange={(e) => set({ from: e.target.value })} className="w-40" />
              <span>to</span>
              <Input type="date" aria-label="Issued to" value={values.to} onChange={(e) => set({ to: e.target.value })} className="w-40" />
            </div>
          </div>
        </div>
        {query.isPending ? (
          <TableSkeleton cols={7} />
        ) : query.isError ? (
          <ErrorState message={query.error.message} onRetry={() => query.refetch()} />
        ) : query.data.items.length === 0 ? (
          <EmptyState icon={FileText} title="No invoices found" description="Try a different filter, or create your first invoice." />
        ) : (
          <>
            <InvoiceTable invoices={query.data.items} />
            <Pagination meta={query.data.meta} onPage={(p) => set({ page: p })} />
          </>
        )}
      </Card>
    </>
  );
}

export default function InvoicesPage() {
  return (
    <Suspense>
      <InvoicesList />
    </Suspense>
  );
}
