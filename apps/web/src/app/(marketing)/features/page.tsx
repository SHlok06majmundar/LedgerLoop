import type { Metadata } from 'next';
import {
  CallToAction,
  CheckList,
  FeatureGrid,
  Section,
  TrustList,
} from '@/components/marketing/sections';

export const metadata: Metadata = { title: 'Features' };

const DEEP_DIVES = [
  {
    id: 'reconciliation',
    title: 'Reconciliation you can trust',
    body: 'Every unmatched bank credit is compared with recorded payments, open invoices and combinations of a customer’s invoices. Each candidate gets a score from the reference, amount, customer name, date and invoice numbers in the narration.',
    points: [
      'Confident matches (90+ with no conflicts) apply automatically',
      'Reference conflicts and over-allocation always need a person',
      'One transfer covering several invoices is detected and sent for review',
      'Rejected suggestions are never suggested again for that line',
    ],
  },
  {
    id: 'collections',
    title: 'Collections that respect your customers',
    body: 'A schedule you control sends a reminder three days before the due date, on the day, and after it falls overdue, escalating when needed. Each step goes out once, and paid invoices are dropped automatically.',
    points: [
      'Customer-level opt-out and per-invoice pause',
      'Manual reminders with your own note, sent now or scheduled',
      'Every email is logged with its delivery status and can be retried',
    ],
  },
  {
    id: 'audit',
    title: 'An audit trail for every rupee',
    body: 'Invoices, payments, allocations, reversals and match decisions are recorded with who did it, when, the request id and the values before and after.',
    points: [
      'Posted payments are reversed, never deleted',
      'Invoices with payments can only be voided after an auditable reversal',
      'Audit records are append-only',
    ],
  },
];

export default function FeaturesPage() {
  return (
    <>
      <Section
        eyebrow="Features"
        title="The accounts-receivable layer your accounting system is missing"
        description="LedgerLoop works alongside Tally, Zoho Books or your ERP. It focuses on what happens after you raise an invoice."
      >
        <FeatureGrid />
      </Section>

      {DEEP_DIVES.map((item, i) => (
        <div key={item.id} className={i % 2 === 0 ? 'border-y bg-muted/40' : ''}>
          <section id={item.id} className="mx-auto grid max-w-6xl scroll-mt-20 gap-8 px-4 py-16 md:grid-cols-2">
            <div>
              <h2 className="text-2xl font-semibold tracking-tight">{item.title}</h2>
              <p className="mt-3 text-muted-foreground">{item.body}</p>
            </div>
            <div className="rounded-xl border bg-card p-6">
              <CheckList items={item.points} />
            </div>
          </section>
        </div>
      ))}

      <Section id="security" eyebrow="Security" title="Your data stays yours">
        <TrustList />
      </Section>

      <Section
        id="mobile"
        eyebrow="Mobile"
        title="Your receivables in your pocket"
        description="The LedgerLoop app for Android and iOS shows what is outstanding and overdue, lets you record a payment on the spot and approve suggested matches on the go."
      />

      <CallToAction />
    </>
  );
}
