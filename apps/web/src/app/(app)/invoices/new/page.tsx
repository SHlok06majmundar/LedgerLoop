'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { PageHeader } from '@/components/app/page-header';
import { InvoiceEditor } from '@/components/invoices/invoice-editor';

function NewInvoice() {
  const customerId = useSearchParams().get('customerId') ?? undefined;
  return (
    <>
      <PageHeader back={{ href: '/invoices', label: 'Invoices' }} title="New invoice" />
      <InvoiceEditor initialCustomerId={customerId} />
    </>
  );
}

export default function NewInvoicePage() {
  return (
    <Suspense>
      <NewInvoice />
    </Suspense>
  );
}
