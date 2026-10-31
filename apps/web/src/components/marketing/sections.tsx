import {
  ArrowRight,
  BellRing,
  Check,
  FileText,
  GitCompareArrows,
  Landmark,
  LineChart,
  Lock,
  ScrollText,
  Smartphone,
  Upload,
  Users,
} from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export const FEATURES = [
  {
    icon: FileText,
    title: 'Invoices that add up',
    body: 'GST-ready line items, discounts and tax computed to the paisa. Issue, email as PDF and track every status from draft to paid.',
  },
  {
    icon: Landmark,
    title: 'Payments and allocations',
    body: 'Record UPI, NEFT, RTGS, IMPS, cheque or cash. Split one payment across many invoices without ever over-allocating.',
  },
  {
    icon: Upload,
    title: 'Bank statement imports',
    body: 'Upload the CSV from your bank. Column mapping is detected for you, duplicates are skipped and every failed row is explained.',
  },
  {
    icon: GitCompareArrows,
    title: 'Explainable reconciliation',
    body: 'Each bank credit is scored against payments and open invoices. Confident matches apply themselves; the rest wait for your approval with reasons.',
  },
  {
    icon: BellRing,
    title: 'Collections on autopilot',
    body: 'Polite reminders before and after the due date, escalations when needed, and full history of what each customer was sent.',
  },
  {
    icon: LineChart,
    title: 'Live receivables picture',
    body: 'Outstanding, overdue, aging buckets, collection rate and top debtors, always scoped to the business you are looking at.',
  },
];

export function Section({
  id,
  eyebrow,
  title,
  description,
  children,
  className,
}: {
  id?: string;
  eyebrow?: string;
  title: string;
  description?: string;
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <section id={id} className={cn('mx-auto max-w-6xl scroll-mt-20 px-4 py-20', className)}>
      <div className="mx-auto mb-12 max-w-2xl text-center">
        {eyebrow && <p className="mb-3 text-sm font-semibold text-primary">{eyebrow}</p>}
        <h2 className="text-balance text-3xl font-semibold tracking-tight sm:text-4xl">{title}</h2>
        {description && <p className="mt-4 text-pretty text-muted-foreground">{description}</p>}
      </div>
      {children}
    </section>
  );
}

export function FeatureGrid() {
  return (
    <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
      {FEATURES.map(({ icon: Icon, title, body }) => (
        <div key={title} className="rounded-xl border bg-card p-6 shadow-xs">
          <div className="mb-4 inline-flex rounded-lg bg-primary-soft p-2.5 text-primary">
            <Icon className="size-5" />
          </div>
          <h3 className="font-semibold">{title}</h3>
          <p className="mt-2 text-sm text-muted-foreground">{body}</p>
        </div>
      ))}
    </div>
  );
}

/** A static, illustrative product preview built from real UI styles. */
export function ProductPreview() {
  const rows = [
    ['NEFT CR ABC TRADERS INV-2026-0041', '₹25,000.00', 'Matched', 'bg-success-soft text-success', '95'],
    ['UPI/SHARMA WHOLESALE', '₹12,500.50', 'Suggested', 'bg-info-soft text-info', '84'],
    ['RTGS KAPOOR & SONS INV-0038 INV-0039', '₹1,40,000.00', 'Review', 'bg-warning-soft text-warning', '91'],
  ];
  return (
    <div className="relative mx-auto max-w-4xl rounded-2xl border bg-card p-3 shadow-2xl shadow-primary/10">
      <div className="grid gap-3 rounded-xl bg-background p-4 sm:grid-cols-3">
        {[
          ['Outstanding', '₹18.4L', 'text-foreground'],
          ['Overdue', '₹4.2L', 'text-danger'],
          ['Collected this month', '₹27.9L', 'text-success'],
        ].map(([label, value, tone]) => (
          <div key={label} className="rounded-lg border bg-card p-4">
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className={cn('mt-1 text-2xl font-semibold tabular', tone)}>{value}</p>
          </div>
        ))}
        <div className="overflow-hidden rounded-lg border bg-card sm:col-span-3">
          <p className="border-b px-4 py-2.5 text-xs font-medium text-muted-foreground">
            Bank statement · Nov 2026
          </p>
          {rows.map(([desc, amount, status, tone, score]) => (
            <div key={desc} className="flex items-center gap-3 border-b px-4 py-3 text-sm last:border-0">
              <span className="min-w-0 flex-1 truncate font-mono text-xs">{desc}</span>
              <span className="tabular">{amount}</span>
              <span className="hidden w-12 text-right text-xs text-muted-foreground tabular sm:block">{score}</span>
              <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', tone)}>{status}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function Steps() {
  const steps = [
    ['Invoice', 'Raise GST invoices and send the PDF from LedgerLoop.'],
    ['Get paid', 'Customers pay however they like: UPI, NEFT, cheque.'],
    ['Import & match', 'Upload the bank statement; matches are found and explained.'],
    ['Collect the rest', 'Reminders follow up on what is still owed, automatically.'],
  ];
  return (
    <ol className="grid gap-6 md:grid-cols-4">
      {steps.map(([title, body], i) => (
        <li key={title} className="relative rounded-xl border bg-card p-6">
          <span className="mb-4 inline-flex size-8 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
            {i + 1}
          </span>
          <h3 className="font-semibold">{title}</h3>
          <p className="mt-2 text-sm text-muted-foreground">{body}</p>
        </li>
      ))}
    </ol>
  );
}

export function TrustList() {
  const items = [
    [Lock, 'Organization-level isolation', 'Every record belongs to one business and is checked on the server for every request.'],
    [ScrollText, 'Append-only audit trail', 'Who created, changed, allocated or reversed what, with before and after values.'],
    [Users, 'Roles that match your team', 'Owner, admin, accountant, manager, staff and read-only viewer.'],
    [Smartphone, 'Mobile companion app', 'Check balances, record a payment or approve a match from your phone.'],
  ] as const;
  return (
    <div className="grid gap-6 sm:grid-cols-2">
      {items.map(([Icon, title, body]) => (
        <div key={title} className="flex gap-4 rounded-xl border bg-card p-6">
          <Icon className="mt-0.5 size-5 shrink-0 text-primary" />
          <div>
            <h3 className="font-semibold">{title}</h3>
            <p className="mt-1 text-sm text-muted-foreground">{body}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

export function CallToAction() {
  return (
    <section className="mx-auto max-w-6xl px-4 pb-24">
      <div className="rounded-2xl bg-primary px-6 py-14 text-center text-primary-foreground sm:px-12">
        <h2 className="text-balance text-3xl font-semibold tracking-tight">
          Stop matching bank lines by hand.
        </h2>
        <p className="mx-auto mt-3 max-w-xl text-primary-foreground/80">
          Set up your business in minutes. Import last month&apos;s statement and see what
          LedgerLoop reconciles for you.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Button asChild size="lg" variant="secondary">
            <Link href="/register">
              Create free account <ArrowRight />
            </Link>
          </Button>
          <Button asChild size="lg" variant="ghost" className="text-primary-foreground hover:bg-white/10">
            <Link href="/contact">Talk to us</Link>
          </Button>
        </div>
      </div>
    </section>
  );
}

export function CheckList({ items }: { items: string[] }) {
  return (
    <ul className="grid gap-2 text-sm">
      {items.map((item) => (
        <li key={item} className="flex gap-2">
          <Check className="mt-0.5 size-4 shrink-0 text-primary" />
          {item}
        </li>
      ))}
    </ul>
  );
}
