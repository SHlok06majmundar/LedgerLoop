'use client';

import { calculateInvoiceTotals } from '@ledgerloop/shared-types';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { CustomerSelect } from '@/components/customers/customer-select';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, Input, NativeSelect, Textarea } from '@/components/ui/input';
import { api, ApiError } from '@/lib/api';
import { applyApiError } from '@/lib/auth';
import {
  minorToInput,
  money,
  parseMoneyInput,
  parseQuantityInput,
  quantityToInput,
  todayISO,
} from '@/lib/format';
import { useSession } from '@/lib/session';
import type { Invoice } from '@/lib/types';

interface Line {
  key: number;
  description: string;
  quantity: string;
  unitPrice: string;
  taxRate: string;
  discount: string;
}

const GST_RATES = ['0', '5', '12', '18', '28'];
let nextKey = 1;
const emptyLine = (): Line => ({
  key: nextKey++,
  description: '',
  quantity: '1',
  unitPrice: '',
  taxRate: '18',
  discount: '',
});

const addDays = (d: string, days: number) => {
  const date = new Date(`${d}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};

/** Converts editable text rows into API line items; null marks a row that is not valid yet. */
function toItems(lines: Line[]) {
  return lines.map((l) => {
    const quantityMilli = parseQuantityInput(l.quantity);
    const unitPriceMinor = parseMoneyInput(l.unitPrice);
    const discountMinor = l.discount ? parseMoneyInput(l.discount) : 0;
    const taxRateBps = Math.round(Number(l.taxRate) * 100);
    if (!l.description.trim() || !quantityMilli || unitPriceMinor === null || discountMinor === null) return null;
    return { description: l.description.trim(), quantityMilli, unitPriceMinor, taxRateBps, discountMinor };
  });
}

export function InvoiceEditor({ invoice, initialCustomerId }: { invoice?: Invoice; initialCustomerId?: string }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const organizationId = useSession((s) => s.organizationId);
  const [customerId, setCustomerId] = useState(
    invoice ? (typeof invoice.customerId === 'object' ? invoice.customerId.id : invoice.customerId) : (initialCustomerId ?? ''),
  );
  const [terms, setTerms] = useState(30);
  const [issueDate, setIssueDate] = useState(invoice?.issueDate ?? todayISO());
  const [dueDate, setDueDate] = useState(invoice?.dueDate ?? '');
  const [notes, setNotes] = useState(invoice?.notes ?? '');
  const [termsText, setTermsText] = useState(invoice?.terms ?? '');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [lines, setLines] = useState<Line[]>(
    invoice?.items.map((i) => ({
      key: nextKey++,
      description: i.description,
      quantity: quantityToInput(i.quantityMilli),
      unitPrice: minorToInput(i.unitPriceMinor),
      taxRate: String(i.taxRateBps / 100),
      discount: i.discountMinor ? minorToInput(i.discountMinor) : '',
    })) ?? [emptyLine()],
  );

  const items = toItems(lines);
  const totals = useMemo(() => {
    try {
      const valid = items.filter((i): i is NonNullable<typeof i> => i !== null);
      return valid.length ? calculateInvoiceTotals(valid) : null;
    } catch {
      return null;
    }
  }, [items]);

  const update = (key: number, field: keyof Line, value: string) =>
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, [field]: value } : l)));

  const save = useMutation({
    mutationFn: async (issue: boolean) => {
      const body = {
        customerId,
        issueDate,
        dueDate: dueDate || addDays(issueDate, terms),
        items: items as NonNullable<(typeof items)[number]>[],
        notes: notes || undefined,
        terms: termsText || undefined,
      };
      const saved = invoice
        ? await api<Invoice>(`/invoices/${invoice.id}`, { method: 'PATCH', body })
        : await api<Invoice>('/invoices', { method: 'POST', body });
      if (issue) await api(`/invoices/${saved.id}/issue`, { method: 'POST' });
      return { saved, issue };
    },
    onSuccess: ({ saved, issue }) => {
      void queryClient.invalidateQueries({ queryKey: [organizationId, 'invoices'] });
      toast.success(issue ? `${saved.invoiceNumber} issued` : `Draft ${saved.invoiceNumber} saved`);
      router.push(`/invoices/${saved.id}`);
    },
    onError: (error) => {
      if (error instanceof ApiError) setErrors(error.fieldErrors);
      applyApiError(error);
    },
  });

  const submit = (issue: boolean) => {
    const problems: Record<string, string> = {};
    if (!customerId) problems.customerId = 'Choose a customer';
    if (items.some((i) => i === null)) problems.items = 'Complete every line: description, quantity and a valid price';
    if (dueDate && dueDate < issueDate) problems.dueDate = 'Due date cannot be before the issue date';
    setErrors(problems);
    if (Object.keys(problems).length === 0) save.mutate(issue);
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <div className="grid gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Customer and dates</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            <Field label="Customer" htmlFor="customer" error={errors.customerId}>
              <CustomerSelect
                id="customer"
                value={customerId}
                invalid={!!errors.customerId}
                onChange={(c) => {
                  setCustomerId(c?.id ?? '');
                  if (c) setTerms(c.paymentTermsDays);
                }}
              />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Issue date" htmlFor="issueDate">
                <Input id="issueDate" type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} />
              </Field>
              <Field
                label="Due date"
                htmlFor="dueDate"
                error={errors.dueDate}
                hint={dueDate ? undefined : `Defaults to ${terms} days after issue (${addDays(issueDate, terms)})`}
              >
                <Input id="dueDate" type="date" value={dueDate} min={issueDate} onChange={(e) => setDueDate(e.target.value)} />
              </Field>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Line items</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3">
            <div className="hidden grid-cols-[1fr_80px_110px_80px_100px_32px] gap-2 text-xs font-medium text-muted-foreground md:grid">
              <span>Description</span>
              <span>Qty</span>
              <span>Unit price (₹)</span>
              <span>GST %</span>
              <span>Discount (₹)</span>
              <span />
            </div>
            {lines.map((line, index) => (
              <div
                key={line.key}
                className="grid grid-cols-2 gap-2 rounded-lg border p-3 md:grid-cols-[1fr_80px_110px_80px_100px_32px] md:border-0 md:p-0"
              >
                <Input
                  className="col-span-2 md:col-span-1"
                  placeholder="Item or service"
                  aria-label={`Line ${index + 1} description`}
                  value={line.description}
                  onChange={(e) => update(line.key, 'description', e.target.value)}
                />
                <Input
                  inputMode="decimal"
                  aria-label={`Line ${index + 1} quantity`}
                  value={line.quantity}
                  onChange={(e) => update(line.key, 'quantity', e.target.value)}
                />
                <Input
                  inputMode="decimal"
                  placeholder="0.00"
                  aria-label={`Line ${index + 1} unit price`}
                  value={line.unitPrice}
                  onChange={(e) => update(line.key, 'unitPrice', e.target.value)}
                />
                <NativeSelect
                  aria-label={`Line ${index + 1} GST rate`}
                  value={line.taxRate}
                  onChange={(e) => update(line.key, 'taxRate', e.target.value)}
                >
                  {GST_RATES.map((r) => (
                    <option key={r} value={r}>
                      {r}%
                    </option>
                  ))}
                </NativeSelect>
                <Input
                  inputMode="decimal"
                  placeholder="0.00"
                  aria-label={`Line ${index + 1} discount`}
                  value={line.discount}
                  onChange={(e) => update(line.key, 'discount', e.target.value)}
                />
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Remove line ${index + 1}`}
                  disabled={lines.length === 1}
                  onClick={() => setLines((ls) => ls.filter((l) => l.key !== line.key))}
                >
                  <Trash2 />
                </Button>
              </div>
            ))}
            {errors.items && <p className="text-xs text-danger">{errors.items}</p>}
            <Button variant="outline" size="sm" className="justify-self-start" onClick={() => setLines((ls) => [...ls, emptyLine()])}>
              <Plus /> Add line
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="grid gap-4 pt-5 sm:grid-cols-2">
            <Field label="Notes to customer" htmlFor="notes">
              <Textarea id="notes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </Field>
            <Field label="Terms" htmlFor="terms">
              <Textarea id="terms" rows={3} value={termsText} onChange={(e) => setTermsText(e.target.value)} placeholder="Bank details, late fee policy…" />
            </Field>
          </CardContent>
        </Card>
      </div>

      <div className="lg:sticky lg:top-20 lg:self-start">
        <Card>
          <CardHeader>
            <CardTitle>Summary</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2 text-sm">
            {[
              ['Subtotal', totals?.subtotalMinor],
              ['Discount', totals ? -totals.discountMinor : undefined],
              ['GST', totals?.taxMinor],
            ].map(([label, value]) => (
              <div key={label as string} className="flex justify-between text-muted-foreground">
                <span>{label}</span>
                <span className="tabular">{money(value as number | undefined)}</span>
              </div>
            ))}
            <div className="mt-2 flex justify-between border-t pt-3 text-base font-semibold">
              <span>Total</span>
              <span className="tabular">{money(totals?.totalMinor)}</span>
            </div>
            <div className="mt-4 grid gap-2">
              <Button onClick={() => submit(true)} loading={save.isPending && save.variables === true}>
                Save and issue
              </Button>
              <Button variant="outline" onClick={() => submit(false)} loading={save.isPending && save.variables === false}>
                Save as draft
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
