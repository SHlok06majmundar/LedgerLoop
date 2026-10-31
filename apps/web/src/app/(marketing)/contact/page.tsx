import { Mail, MessageSquare, Phone } from 'lucide-react';
import type { Metadata } from 'next';
import { Section } from '@/components/marketing/sections';
import { ContactForm } from '@/components/marketing/contact-form';

export const metadata: Metadata = { title: 'Contact' };

export default function ContactPage() {
  return (
    <Section
      eyebrow="Contact"
      title="Talk to the LedgerLoop team"
      description="Questions about pricing, onboarding or migrating your receivables? We reply within one business day."
    >
      <div className="grid gap-8 lg:grid-cols-[1fr_1.4fr]">
        <div className="grid content-start gap-4">
          {[
            [Mail, 'Email', 'majmundarshlok06@gmail.com'],
            [Phone, 'Phone', 'Mon–Sat, 10am–7pm IST'],
            [MessageSquare, 'Onboarding', 'We help import your customers and open invoices.'],
          ].map(([Icon, title, body]) => {
            const I = Icon as typeof Mail;
            return (
              <div key={title as string} className="flex gap-4 rounded-xl border bg-card p-5">
                <I className="mt-0.5 size-5 text-primary" />
                <div>
                  <p className="font-medium">{title as string}</p>
                  <p className="text-sm text-muted-foreground">{body as string}</p>
                </div>
              </div>
            );
          })}
        </div>
        <ContactForm />
      </div>
    </Section>
  );
}
