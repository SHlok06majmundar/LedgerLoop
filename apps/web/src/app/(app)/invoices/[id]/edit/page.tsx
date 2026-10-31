'use client';

import { useQuery } from '@tanstack/react-query';
import { use } from 'react';
import { PageHeader } from '@/components/app/page-header';
import { InvoiceEditor } from '@/components/invoices/invoice-editor';
import { ErrorState, Skeleton } from '@/components/ui/feedback';
import { api } from '@/lib/api';
import { useOrgQueryKey } from '@/lib/hooks';
import type { Invoice } from '@/lib/types';

export default function EditInvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const invoice = useQuery({
    queryKey: useOrgQueryKey('invoices', id),
    queryFn: () => api<Invoice>(`/invoices/${id}`),
  });

  if (invoice.isPending) return <Skeleton className="h-96" />;
  if (invoice.isError) return <ErrorState message={invoice.error.message} />;
  if (invoice.data.status !== 'DRAFT') {
    return <ErrorState message="Only draft invoices can be edited. Void and re-issue to correct an issued invoice." />;
  }
  return (
    <>
      <PageHeader back={{ href: `/invoices/${id}`, label: invoice.data.invoiceNumber }} title={`Edit ${invoice.data.invoiceNumber}`} />
      <InvoiceEditor invoice={invoice.data} />
    </>
  );
}
