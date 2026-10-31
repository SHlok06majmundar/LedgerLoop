import { InvoiceStatus, PaymentStatus } from '@ledgerloop/shared-types';
import type { Model } from 'mongoose';
import type { Customer } from '../customers/customer.schema';
import type { Invoice } from '../invoices/invoice.schema';
import type { Allocation } from '../payments/schemas/allocation.schema';
import type { Payment } from '../payments/schemas/payment.schema';
import { mentionsCustomer, type Candidate, type StatementLine } from './domain/matching';

const MAX_GROUP_INVOICES = 12;
const OPEN = [InvoiceStatus.ISSUED, InvoiceStatus.PARTIALLY_PAID, InvoiceStatus.OVERDUE];

interface OpenInvoice {
  id: string;
  customerId: string;
  number: string;
  outstanding: number;
  issueDate: string;
}

/**
 * In-memory view of everything a run can match against: payments without a
 * bank line and open invoices. Consumed as matches are applied during a run.
 */
export class CandidatePool {
  private constructor(
    private readonly payments: Map<string, Candidate>,
    private readonly invoices: Map<string, OpenInvoice>,
    private readonly customerNames: Map<string, string>,
  ) {}

  static async load(
    organizationId: string,
    models: {
      payments: Model<Payment>;
      invoices: Model<Invoice>;
      allocations: Model<Allocation>;
      customers: Model<Customer>;
    },
  ): Promise<CandidatePool> {
    const [customers, payments, invoices] = await Promise.all([
      models.customers.find({ organizationId }).select('name').lean().exec(),
      models.payments
        .find({ organizationId, status: PaymentStatus.POSTED, bankTransactionId: null })
        .lean()
        .exec(),
      models.invoices
        .find({ organizationId, status: { $in: OPEN } })
        .select('customerId invoiceNumber totalMinor allocatedMinor issueDate')
        .lean()
        .exec(),
    ]);
    const names = new Map(customers.map((c) => [c._id.toString(), c.name]));
    const numbers = new Map(invoices.map((i) => [i._id.toString(), i.invoiceNumber]));

    const allocations = await models.allocations
      .find({ organizationId, paymentId: { $in: payments.map((p) => p._id) }, status: 'ACTIVE' })
      .select('paymentId invoiceId')
      .lean()
      .exec();
    const invoicesByPayment = new Map<string, string[]>();
    for (const a of allocations) {
      const list = invoicesByPayment.get(a.paymentId.toString()) ?? [];
      const n = numbers.get(a.invoiceId.toString());
      if (n) list.push(n);
      invoicesByPayment.set(a.paymentId.toString(), list);
    }

    const paymentCandidates = new Map<string, Candidate>(
      payments.map((p) => [
        `payment:${p._id.toString()}`,
        {
          kind: 'PAYMENT',
          key: `payment:${p._id.toString()}`,
          customerId: p.customerId.toString(),
          customerName: names.get(p.customerId.toString()) ?? '',
          amountMinor: p.amountMinor,
          reference: p.reference,
          date: p.paymentDate,
          invoiceNumbers: invoicesByPayment.get(p._id.toString()) ?? [],
        },
      ]),
    );
    const openInvoices = new Map<string, OpenInvoice>(
      invoices
        .filter((i) => i.totalMinor > i.allocatedMinor)
        .map((i) => [
          i._id.toString(),
          {
            id: i._id.toString(),
            customerId: i.customerId.toString(),
            number: i.invoiceNumber,
            outstanding: i.totalMinor - i.allocatedMinor,
            issueDate: i.issueDate,
          },
        ]),
    );
    return new CandidatePool(paymentCandidates, openInvoices, names);
  }

  /** Plausible candidates for one bank line; obviously unrelated ones are skipped early. */
  forLine(line: StatementLine, excludeKeys: string[] = []): Candidate[] {
    const narration = `${line.description} ${line.reference ?? ''}`
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '');
    const excluded = new Set(excludeKeys);
    const out: Candidate[] = [];

    for (const p of this.payments.values()) {
      const refHit =
        p.reference && narration.includes(p.reference.replace(/[^A-Z0-9]/gi, '').toUpperCase());
      if ((p.amountMinor === line.amountMinor || refHit) && !excluded.has(p.key)) out.push(p);
    }

    const byCustomer = new Map<string, OpenInvoice[]>();
    for (const inv of this.invoices.values()) {
      const named = narration.includes(inv.number.replace(/[^A-Z0-9]/gi, '').toUpperCase());
      const customerName = this.customerNames.get(inv.customerId) ?? '';
      const mentioned = mentionsCustomer(line.description, customerName);
      if (mentioned) {
        byCustomer.set(inv.customerId, [...(byCustomer.get(inv.customerId) ?? []), inv]);
      }
      if (
        (named || mentioned || inv.outstanding === line.amountMinor) &&
        inv.outstanding >= line.amountMinor
      ) {
        const c = this.invoiceCandidate([inv]);
        if (!excluded.has(c.key)) out.push(c);
      }
    }

    // Combined payments: subsets of a mentioned customer's invoices that sum to the amount.
    for (const invoices of byCustomer.values()) {
      if (invoices.some((i) => i.outstanding === line.amountMinor)) continue;
      const group = exactSubset(
        invoices
          .sort((a, b) => a.issueDate.localeCompare(b.issueDate))
          .slice(0, MAX_GROUP_INVOICES),
        line.amountMinor,
      );
      if (group && group.length > 1) {
        const c = this.invoiceCandidate(group);
        if (!excluded.has(c.key)) out.push(c);
      }
    }
    return out;
  }

  /** Removes or reduces what an applied match used up. */
  consume(candidate: Candidate, invoiceAmounts: number[]): void {
    if (candidate.kind === 'PAYMENT') {
      this.payments.delete(candidate.key);
      return;
    }
    candidate.invoiceIds?.forEach((id, i) => {
      const inv = this.invoices.get(id);
      if (!inv) return;
      inv.outstanding -= invoiceAmounts[i] ?? 0;
      if (inv.outstanding <= 0) this.invoices.delete(id);
    });
  }

  /** Outstanding amounts, in candidate order, as currently known to the pool. */
  outstandingOf(candidate: Candidate): number[] {
    return (candidate.invoiceIds ?? []).map((id) => this.invoices.get(id)?.outstanding ?? 0);
  }

  private invoiceCandidate(invoices: OpenInvoice[]): Candidate {
    const first = invoices[0]!;
    return {
      kind: invoices.length > 1 ? 'INVOICE_GROUP' : 'INVOICE',
      key: `invoice:${invoices
        .map((i) => i.id)
        .sort()
        .join('+')}`,
      customerId: first.customerId,
      customerName: this.customerNames.get(first.customerId) ?? '',
      amountMinor: invoices.reduce((s, i) => s + i.outstanding, 0),
      date: invoices
        .map((i) => i.issueDate)
        .sort()
        .at(-1)!,
      invoiceNumbers: invoices.map((i) => i.number),
      invoiceIds: invoices.map((i) => i.id),
    };
  }
}

/** Smallest-first exact subset sum over at most 12 items (4096 combinations). */
function exactSubset<T extends { outstanding: number }>(items: T[], target: number): T[] | null {
  let best: T[] | null = null;
  for (let mask = 1; mask < 1 << items.length; mask++) {
    let sum = 0;
    const picked: T[] = [];
    for (let i = 0; i < items.length; i++) {
      if (mask & (1 << i)) {
        sum += items[i]!.outstanding;
        picked.push(items[i]!);
      }
    }
    if (sum === target && (!best || picked.length < best.length)) best = picked;
  }
  return best;
}

