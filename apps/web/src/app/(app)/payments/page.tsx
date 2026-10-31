'use client';

import { Permission } from '@ledgerloop/shared-types';
import { useQuery } from '@tanstack/react-query';
import { Plus, Wallet } from 'lucide-react';
import Link from 'next/link';
import { Suspense } from 'react';
import { FilterTabs, Pagination, SearchInput, useListParams } from '@/components/app/list';
import { PageHeader } from '@/components/app/page-header';
import { PaymentTable } from '@/components/payments/payment-table';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState, ErrorState, TableSkeleton } from '@/components/ui/feedback';
import { NativeSelect } from '@/components/ui/input';
import { apiPage } from '@/lib/api';
import { useCan, useOrgQueryKey } from '@/lib/hooks';
import type { Payment } from '@/lib/types';

const DEFAULTS = { search: '', allocation: '', method: '', status: '' };
const METHODS = ['UPI', 'NEFT', 'RTGS', 'IMPS', 'BANK_TRANSFER', 'CASH', 'CHEQUE'];

function PaymentsList() {
  const canWrite = useCan(Permission.PAYMENTS_WRITE);
  const { values, page, set } = useListParams(DEFAULTS);
  const query = useQuery({
    queryKey: useOrgQueryKey('payments', values, page),
    queryFn: () => apiPage<Payment>('/payments', { query: { ...values, page, limit: 20 } }),
    placeholderData: (prev) => prev,
  });

  return (
    <>
      <PageHeader
        title="Payments"
        description="Money received, and the invoices it pays."
        actions={
          canWrite && (
            <Button asChild>
              <Link href="/payments/new">
                <Plus /> Record payment
              </Link>
            </Button>
          )
        }
      />
      <Card>
        <div className="grid gap-3 border-b p-4">
          <FilterTabs
            value={values.allocation}
            onChange={(allocation) => set({ allocation })}
            options={[
              { value: '', label: 'All' },
              { value: 'unallocated', label: 'Unallocated' },
              { value: 'partial', label: 'Partly allocated' },
              { value: 'full', label: 'Fully allocated' },
            ]}
          />
          <div className="flex flex-col gap-3 sm:flex-row">
            <SearchInput value={values.search} onChange={(search) => set({ search })} placeholder="Search number, reference, notes" />
            <NativeSelect aria-label="Method" className="sm:w-44" value={values.method} onChange={(e) => set({ method: e.target.value })}>
              <option value="">All methods</option>
              {METHODS.map((m) => (
                <option key={m} value={m}>
                  {m.replace('_', ' ')}
                </option>
              ))}
            </NativeSelect>
            <NativeSelect aria-label="Status" className="sm:w-40" value={values.status} onChange={(e) => set({ status: e.target.value })}>
              <option value="">Any status</option>
              <option value="POSTED">Posted</option>
              <option value="REVERSED">Reversed</option>
            </NativeSelect>
          </div>
        </div>
        {query.isPending ? (
          <TableSkeleton cols={8} />
        ) : query.isError ? (
          <ErrorState message={query.error.message} onRetry={() => query.refetch()} />
        ) : query.data.items.length === 0 ? (
          <EmptyState icon={Wallet} title="No payments found" />
        ) : (
          <>
            <PaymentTable payments={query.data.items} />
            <Pagination meta={query.data.meta} onPage={(p) => set({ page: p })} />
          </>
        )}
      </Card>
    </>
  );
}

export default function PaymentsPage() {
  return (
    <Suspense>
      <PaymentsList />
    </Suspense>
  );
}
