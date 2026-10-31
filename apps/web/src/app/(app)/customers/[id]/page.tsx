'use client';

import { Permission } from '@ledgerloop/shared-types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Archive, ArchiveRestore, FilePlus2, Pencil, Wallet } from 'lucide-react';
import Link from 'next/link';
import { use, useState } from 'react';
import { toast } from 'sonner';
import { ActivityFeed } from '@/components/app/activity-feed';
import { PageHeader } from '@/components/app/page-header';
import { StatTile } from '@/components/app/stat-tile';
import { CustomerForm } from '@/components/customers/customer-form';
import { InvoiceTable } from '@/components/invoices/invoice-table';
import { PaymentTable } from '@/components/payments/payment-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogTrigger } from '@/components/ui/dialog';
import { EmptyState, ErrorState, Skeleton, TableSkeleton } from '@/components/ui/feedback';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { api, apiPage } from '@/lib/api';
import { applyApiError } from '@/lib/auth';
import { money } from '@/lib/format';
import { useCan, useOrgQueryKey } from '@/lib/hooks';
import type { Customer, CustomerSummary, Invoice, Payment } from '@/lib/types';

function Detail({ label, value }: { label: string; value?: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-sm">{value || '—'}</dd>
    </div>
  );
}

export default function CustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const queryClient = useQueryClient();
  const canWrite = useCan(Permission.CUSTOMERS_WRITE);
  const canAudit = useCan(Permission.AUDIT_READ);
  const [editing, setEditing] = useState(false);
  const customerKey = useOrgQueryKey('customers', id);

  const customer = useQuery({ queryKey: customerKey, queryFn: () => api<Customer>(`/customers/${id}`) });
  const summary = useQuery({
    queryKey: useOrgQueryKey('customers', id, 'summary'),
    queryFn: () => api<CustomerSummary>(`/customers/${id}/summary`),
  });
  const invoices = useQuery({
    queryKey: useOrgQueryKey('customers', id, 'invoices'),
    queryFn: () => apiPage<Invoice>(`/customers/${id}/invoices`, { query: { limit: 50 } }),
  });
  const payments = useQuery({
    queryKey: useOrgQueryKey('customers', id, 'payments'),
    queryFn: () => apiPage<Payment>(`/customers/${id}/payments`, { query: { limit: 50 } }),
  });

  const archive = useMutation({
    mutationFn: (restore: boolean) =>
      restore
        ? api(`/customers/${id}/restore`, { method: 'POST' })
        : api(`/customers/${id}`, { method: 'DELETE' }),
    onSuccess: (_, restore) => {
      toast.success(restore ? 'Customer restored' : 'Customer archived');
      void queryClient.invalidateQueries({ queryKey: customerKey });
    },
    onError: (e) => applyApiError(e),
  });

  if (customer.isPending) return <Skeleton className="h-64" />;
  if (customer.isError) return <ErrorState message={customer.error.message} />;
  const c = customer.data;
  const s = summary.data;
  const reconciled = (payments.data?.items ?? []).filter((p) => p.bankTransactionId);

  return (
    <>
      <PageHeader
        back={{ href: '/customers', label: 'Customers' }}
        title={
          <span className="flex items-center gap-2">
            {c.name} {c.archivedAt && <Badge>Archived</Badge>}
          </span>
        }
        description={[c.email, c.phone].filter(Boolean).join(' · ')}
        actions={
          canWrite && (
            <>
              <Button variant="outline" onClick={() => archive.mutate(Boolean(c.archivedAt))} loading={archive.isPending}>
                {c.archivedAt ? <ArchiveRestore /> : <Archive />}
                {c.archivedAt ? 'Restore' : 'Archive'}
              </Button>
              <Dialog open={editing} onOpenChange={setEditing}>
                <DialogTrigger asChild>
                  <Button variant="outline">
                    <Pencil /> Edit
                  </Button>
                </DialogTrigger>
                <DialogContent title="Edit customer" className="max-w-2xl">
                  <CustomerForm
                    customer={c}
                    onDone={() => {
                      setEditing(false);
                      void queryClient.invalidateQueries({ queryKey: customerKey });
                    }}
                  />
                </DialogContent>
              </Dialog>
              {!c.archivedAt && (
                <Button asChild>
                  <Link href={`/invoices/new?customerId=${id}`}>
                    <FilePlus2 /> New invoice
                  </Link>
                </Button>
              )}
            </>
          )
        }
      />

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="invoices">Invoices</TabsTrigger>
          <TabsTrigger value="payments">Payments</TabsTrigger>
          <TabsTrigger value="reconciliation">Reconciliation</TabsTrigger>
          {canAudit && <TabsTrigger value="activity">Activity history</TabsTrigger>}
        </TabsList>

        <TabsContent value="overview" className="grid gap-6">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatTile label="Outstanding" loading={!s} value={money(s?.outstandingMinor)} hint={s && `${s.openInvoices} open invoices`} />
            <StatTile label="Overdue" tone="danger" loading={!s} value={money(s?.overdueMinor)} hint={s && `${s.overdueInvoices} overdue`} />
            <StatTile label="Total invoiced" loading={!s} value={money(s?.totalInvoicedMinor)} />
            <StatTile
              label="Total received"
              loading={!s}
              value={money(s?.totalReceivedMinor)}
              hint={s?.unallocatedMinor ? `${money(s.unallocatedMinor)} not yet allocated` : undefined}
            />
          </div>
          <Card>
            <CardHeader>
              <CardTitle>Details</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <Detail label="GSTIN" value={c.gstin} />
                <Detail label="Payment terms" value={`${c.paymentTermsDays} days`} />
                <Detail
                  label="Credit limit"
                  value={
                    s?.creditLimitMinor != null
                      ? `${money(s.creditLimitMinor)} (${money(s.availableCreditMinor)} available)`
                      : 'No limit'
                  }
                />
                <Detail label="Automated reminders" value={c.remindersEnabled ? 'On' : 'Off'} />
                <Detail
                  label="Billing address"
                  value={
                    c.billingAddress &&
                    [c.billingAddress.line1, c.billingAddress.line2, c.billingAddress.city, c.billingAddress.state, c.billingAddress.postalCode]
                      .filter(Boolean)
                      .join(', ')
                  }
                />
                <Detail label="Notes" value={c.notes} />
              </dl>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="invoices">
          <Card>
            {invoices.isPending ? (
              <TableSkeleton />
            ) : invoices.data?.items.length ? (
              <InvoiceTable invoices={invoices.data.items} showCustomer={false} />
            ) : (
              <EmptyState title="No invoices yet" />
            )}
          </Card>
        </TabsContent>

        <TabsContent value="payments">
          <Card>
            {payments.isPending ? (
              <TableSkeleton />
            ) : payments.data?.items.length ? (
              <PaymentTable payments={payments.data.items} showCustomer={false} />
            ) : (
              <EmptyState
                icon={Wallet}
                title="No payments recorded"
                action={
                  <Button asChild size="sm">
                    <Link href={`/payments/new?customerId=${id}`}>Record payment</Link>
                  </Button>
                }
              />
            )}
          </Card>
        </TabsContent>

        <TabsContent value="reconciliation">
          <Card>
            {reconciled.length ? (
              <PaymentTable payments={reconciled} showCustomer={false} />
            ) : (
              <EmptyState
                title="No payments reconciled with the bank yet"
                description="Payments matched to imported bank statement lines appear here."
              />
            )}
          </Card>
        </TabsContent>

        {canAudit && (
          <TabsContent value="activity">
            <Card className="p-6">
              <ActivityFeed entityType="Customer" entityId={id} />
            </Card>
          </TabsContent>
        )}
      </Tabs>
    </>
  );
}
