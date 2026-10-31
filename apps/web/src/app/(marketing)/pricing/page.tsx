import type { Metadata } from 'next';
import Link from 'next/link';
import { CheckList, Section } from '@/components/marketing/sections';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export const metadata: Metadata = { title: 'Pricing' };

const PLANS = [
  {
    name: 'Starter',
    price: '₹0',
    period: 'forever',
    description: 'For founders sending their first invoices.',
    features: ['1 organization, 2 team members', 'Up to 50 invoices a month', 'Manual payment recording', 'PDF invoices by email'],
    cta: 'Start free',
  },
  {
    name: 'Growth',
    price: '₹2,499',
    period: 'per month',
    description: 'For distributors and manufacturers collecting every week.',
    features: [
      'Unlimited invoices and customers',
      '10 team members with roles',
      'Bank statement imports and reconciliation',
      'Automated reminder schedules',
      'Analytics and aging reports',
    ],
    cta: 'Start 14-day trial',
    featured: true,
  },
  {
    name: 'Scale',
    price: 'Custom',
    period: 'annual',
    description: 'For groups running several businesses.',
    features: ['Multiple organizations', 'Unlimited members', 'Priority support and onboarding', 'Custom matching rules'],
    cta: 'Contact sales',
  },
];

export default function PricingPage() {
  return (
    <Section
      eyebrow="Pricing"
      title="Simple plans that grow with your collections"
      description="Prices exclude GST. Change or cancel any time."
    >
      <div className="grid gap-6 lg:grid-cols-3">
        {PLANS.map((plan) => (
          <div
            key={plan.name}
            className={cn(
              'flex flex-col rounded-2xl border bg-card p-8 shadow-xs',
              plan.featured && 'border-primary ring-1 ring-primary',
            )}
          >
            {plan.featured && (
              <p className="mb-4 w-fit rounded-full bg-primary-soft px-2.5 py-0.5 text-xs font-medium text-primary">
                Most popular
              </p>
            )}
            <h3 className="text-lg font-semibold">{plan.name}</h3>
            <p className="mt-1 text-sm text-muted-foreground">{plan.description}</p>
            <p className="mt-6">
              <span className="text-4xl font-semibold tabular">{plan.price}</span>
              <span className="ml-1 text-sm text-muted-foreground">{plan.period}</span>
            </p>
            <div className="my-8 flex-1">
              <CheckList items={plan.features} />
            </div>
            <Button asChild variant={plan.featured ? 'default' : 'outline'}>
              <Link href={plan.name === 'Scale' ? '/contact' : '/register'}>{plan.cta}</Link>
            </Button>
          </div>
        ))}
      </div>
    </Section>
  );
}
