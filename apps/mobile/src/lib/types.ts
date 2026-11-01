export interface Ref {
  id: string;
  name: string;
  email?: string;
}

export interface Invoice {
  id: string;
  invoiceNumber: string;
  status: string;
  customerId: Ref | string;
  issueDate: string;
  dueDate: string;
  currency: string;
  totalMinor: number;
  allocatedMinor: number;
  outstandingMinor: number;
  items: { description: string; quantityMilli: number; unitPriceMinor: number; totalMinor: number }[];
  subtotalMinor: number;
  taxMinor: number;
  discountMinor: number;
  voidReason?: string;
}

export interface Customer {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  gstin?: string;
  paymentTermsDays: number;
  notes?: string;
  archivedAt?: string | null;
}

export interface Payment {
  id: string;
  paymentNumber: string;
  customerId: Ref | string;
  amountMinor: number;
  allocatedMinor: number;
  unallocatedMinor: number;
  method: string;
  reference?: string;
  paymentDate: string;
  notes?: string;
  status: string;
  bankTransactionId: string | null;
  reversedAt: string | null;
  reversalReason?: string;
}

export interface PaymentAllocation {
  id: string;
  amountMinor: number;
  status: string;
  invoiceId: { id: string; invoiceNumber: string; status: string } | string;
}

export interface Match {
  id: string;
  kind: string;
  status: string;
  score: number;
  decision?: string;
  signals: { code: string; points: number; detail: string }[];
  blocks: string[];
  bankTransactionId: { transactionDate: string; description: string; amountMinor: number };
  customerId?: { name: string };
  invoiceIds: { id: string; invoiceNumber: string }[];
  paymentId?: { paymentNumber: string } | null;
}

export interface Membership {
  id: string;
  role: string;
  organization: { id: string; name: string; currency: string };
}

export const refName = (r: Ref | string | null | undefined) => (typeof r === 'object' && r ? r.name : '—');
export const refId = (r: Ref | string) => (typeof r === 'object' ? r.id : r);
