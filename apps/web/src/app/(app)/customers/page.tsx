'use client';

import { Permission } from '@ledgerloop/shared-types';
import { useQuery } from '@tanstack/react-query';
import { Plus, Users } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Suspense, useState } from 'react';
import { FilterTabs, Pagination, SearchInput, useListParams } from '@/components/app/list';
import { PageHeader } from '@/components/app/page-header';
import { CustomerForm } from '@/components/customers/customer-form';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog, DialogContent, DialogTrigger } from '@/components/ui/dialog';
import { EmptyState, ErrorState, TableSkeleton } from '@/components/ui/feedback';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { apiPage } from '@/lib/api';
import { useCan, useOrgQueryKey } from '@/lib/hooks';
import type { Customer } from '@/lib/types';

const DEFAULTS = { search: '', status: 'active' };

function CustomersList() {
  const router = useRouter();
  const canWrite = useCan(Permission.CUSTOMERS_WRITE);
  const [open, setOpen] = useState(false);
  const { values, page, set } = useListParams(DEFAULTS);

  const query = useQuery({
    queryKey: useOrgQueryKey('customers', values, page),
    queryFn: () => apiPage<Customer>('/customers', { query: { ...values, page, limit: 20, sort: 'name', order: 'asc' } }),
    placeholderData: (prev) => prev,
  });

  return (
    <>
      <PageHeader
        title="Customers"
        description="Everyone you bill, with what they owe."
        actions={
          canWrite && (
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus /> Add customer
                </Button>
              </DialogTrigger>
              <DialogContent title="Add customer" className="max-w-2xl">
                <CustomerForm
                  onDone={(c) => {
                    setOpen(false);
                    router.push(`/customers/${c.id}`);
                  }}
                />
              </DialogContent>
            </Dialog>
          )
        }
      />
      <Card>
        <div className="flex flex-col gap-3 border-b p-4 sm:flex-row sm:items-center sm:justify-between">
          <SearchInput value={values.search} onChange={(search) => set({ search })} placeholder="Search name, email, phone, GSTIN" />
          <FilterTabs
            value={values.status}
            onChange={(status) => set({ status })}
            options={[
              { value: 'active', label: 'Active' },
              { value: 'archived', label: 'Archived' },
              { value: 'all', label: 'All' },
            ]}
          />
        </div>
        {query.isPending ? (
          <TableSkeleton />
        ) : query.isError ? (
          <ErrorState message={query.error.message} onRetry={() => query.refetch()} />
        ) : query.data.items.length === 0 ? (
          <EmptyState
            icon={Users}
            title={values.search ? 'No customers match your search' : 'No customers yet'}
            description="Add the businesses you invoice to start tracking what they owe."
          />
        ) : (
          <>
            <Table>
              <THead>
                <TR>
                  <TH>Name</TH>
                  <TH>Email</TH>
                  <TH>Phone</TH>
                  <TH>GSTIN</TH>
                  <TH className="text-right">Terms</TH>
                </TR>
              </THead>
              <TBody>
                {query.data.items.map((c) => (
                  <TR key={c.id}>
                    <TD>
                      <Link href={`/customers/${c.id}`} className="font-medium hover:underline">
                        {c.name}
                      </Link>
                      {c.archivedAt && <Badge className="ml-2">Archived</Badge>}
                    </TD>
                    <TD className="text-muted-foreground">{c.email ?? '—'}</TD>
                    <TD className="text-muted-foreground">{c.phone ?? '—'}</TD>
                    <TD className="font-mono text-xs">{c.gstin ?? '—'}</TD>
                    <TD className="text-right tabular">{c.paymentTermsDays} days</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
            <Pagination meta={query.data.meta} onPage={(p) => set({ page: p })} />
          </>
        )}
      </Card>
    </>
  );
}

export default function CustomersPage() {
  return (
    <Suspense>
      <CustomersList />
    </Suspense>
  );
}
