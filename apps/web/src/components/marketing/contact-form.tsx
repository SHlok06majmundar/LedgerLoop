'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Field, Input, Textarea } from '@/components/ui/input';

const CONTACT_EMAIL = 'majmundarshlok06@gmail.com';

/** Opens the visitor's mail client with the message prefilled; nothing is stored. */
export function ContactForm() {
  const [form, setForm] = useState({ name: '', company: '', email: '', message: '' });
  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const subject = encodeURIComponent(`LedgerLoop enquiry from ${form.company || form.name}`);
    const body = encodeURIComponent(`${form.message}\n\n${form.name}\n${form.company}\n${form.email}`);
    window.location.href = `mailto:${CONTACT_EMAIL}?subject=${subject}&body=${body}`;
  };

  return (
    <form onSubmit={submit} className="grid gap-4 rounded-xl border bg-card p-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Your name" htmlFor="name">
          <Input id="name" required value={form.name} onChange={set('name')} autoComplete="name" />
        </Field>
        <Field label="Company" htmlFor="company">
          <Input id="company" value={form.company} onChange={set('company')} autoComplete="organization" />
        </Field>
      </div>
      <Field label="Work email" htmlFor="email">
        <Input id="email" type="email" required value={form.email} onChange={set('email')} autoComplete="email" />
      </Field>
      <Field label="How can we help?" htmlFor="message">
        <Textarea id="message" required rows={5} value={form.message} onChange={set('message')} />
      </Field>
      <Button type="submit" className="justify-self-start">
        Send message
      </Button>
    </form>
  );
}
