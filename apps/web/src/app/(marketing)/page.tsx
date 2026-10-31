import { ArrowRight } from 'lucide-react';
import Link from 'next/link';
import {
  CallToAction,
  FeatureGrid,
  ProductPreview,
  Section,
  Steps,
  TrustList,
} from '@/components/marketing/sections';
import { Button } from '@/components/ui/button';

const QUESTIONS = [
  'How much money is outstanding right now?',
  'Which customers have not paid?',
  'Which bank credits belong to which invoices?',
  'Which payments need a second look?',
  'Who should get a reminder today?',
];

export default function LandingPage() {
  return (
    <>
      <section className="relative overflow-hidden">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 -top-40 h-[480px] bg-[radial-gradient(ellipse_at_top,var(--primary-soft),transparent_65%)]"
        />
        <div className="relative mx-auto max-w-6xl px-4 pb-16 pt-20 text-center sm:pt-28">
          <p className="mx-auto mb-5 inline-flex items-center gap-2 rounded-full border bg-card px-3 py-1 text-xs text-muted-foreground">
            <span className="size-1.5 rounded-full bg-success" /> Built for GST invoicing and Indian bank statements
          </p>
          <h1 className="mx-auto max-w-3xl text-balance text-4xl font-semibold tracking-tight sm:text-6xl">
            Receivables, <span className="text-primary">reconciled.</span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-pretty text-lg text-muted-foreground">
            LedgerLoop connects your invoices, incoming payments and bank statements, matches
            them for you with reasons you can check, and follows up on what is still owed.
          </p>
          <div className="mt-9 flex flex-wrap justify-center gap-3">
            <Button asChild size="lg">
              <Link href="/register">
                Start free <ArrowRight />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href="/features">See how it works</Link>
            </Button>
          </div>
        </div>
        <div className="relative px-4 pb-20">
          <ProductPreview />
        </div>
      </section>

      <Section
        eyebrow="Why LedgerLoop"
        title="Five questions, answered every morning"
        description="Not another accounting system: LedgerLoop is the operating layer between raising an invoice and seeing the money in your bank."
      >
        <ul className="mx-auto grid max-w-3xl gap-3">
          {QUESTIONS.map((q, i) => (
            <li key={q} className="flex items-center gap-4 rounded-xl border bg-card px-5 py-4">
              <span className="text-sm font-semibold text-primary tabular">0{i + 1}</span>
              <span className="font-medium">{q}</span>
            </li>
          ))}
        </ul>
      </Section>

      <div className="border-y bg-muted/40">
        <Section eyebrow="Features" title="Everything between invoice and cash">
          <FeatureGrid />
        </Section>
      </div>

      <Section eyebrow="How it works" title="From invoice to reconciled in four steps">
        <Steps />
      </Section>

      <div className="border-y bg-muted/40">
        <Section
          eyebrow="Trust"
          title="Built like a financial system"
          description="Money is stored in exact paise, every payment write is idempotent and nothing posted is ever silently deleted."
        >
          <TrustList />
        </Section>
      </div>

      <div className="pt-20">
        <CallToAction />
      </div>
    </>
  );
}
