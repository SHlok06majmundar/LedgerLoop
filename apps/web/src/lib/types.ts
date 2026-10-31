/** Response shapes of the LedgerLoop API as used by the web app. Amounts are minor units. */

export interface Address {
  line1: string;
  line2: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
}

export interface Customer {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  gstin?: string;
  billingAddress?: Address;
  shippingAddress?: Address;
  creditLimitMinor?: number;
  paymentTermsDays: number;
  notes?: string;
  remindersEnabled: boolean;
  archivedAt: string | null;
  createdAt: string;
}

export interface CustomerSummary {
  totalInvoicedMinor: number;
  totalReceivedMinor: number;
  outstandingMinor: number;
  overdueMinor: number;
  unallocatedMinor: number;
  openInvoices: number;
  overdueInvoices: number;
  creditLimitMinor: number | null;
  availableCreditMinor: number | null;
}

export interface CustomerRef {
  id: string;
  name: string;
  email?: string;
}

export interface InvoiceItem {
  description: string;
  quantityMilli: number;
  unitPriceMinor: number;
  taxRateBps: number;
  discountMinor: number;
  amountMinor: number;
  taxMinor: number;
  totalMinor: number;
}

export interface Invoice {
  id: string;
  invoiceNumber: string;
  status: string;
  customerId: CustomerRef | string;
  issueDate: string;
  dueDate: string;
  currency: string;
  items: InvoiceItem[];
  subtotalMinor: number;
  discountMinor: number;
  taxMinor: number;
  totalMinor: number;
  allocatedMinor: number;
  outstandingMinor: number;
  notes?: string;
  terms?: string;
  customerSnapshot?: { name: string; email?: string; gstin?: string };
  issuedAt: string | null;
  sentAt: string | null;
  voidReason?: string;
  remindersPaused?: boolean;
  createdAt: string;
}

export interface Allocation {
  id: string;
  amountMinor: number;
  status: 'ACTIVE' | 'REVERSED';
  reversalReason?: string;
  createdAt: string;
  invoiceId?: { id: string; invoiceNumber: string; status: string; dueDate: string } | string;
  payment?: { id: string; paymentNumber: string; reference?: string; method: string; paymentDate: string };
}

export interface Payment {
  id: string;
  paymentNumber: string;
  customerId: CustomerRef | string;
  amountMinor: number;
  allocatedMinor: number;
  unallocatedMinor: number;
  method: string;
  reference?: string;
  paymentDate: string;
  notes?: string;
  status: 'POSTED' | 'REVERSED';
  reversalReason?: string;
  bankTransactionId: string | null;
  allocations?: Allocation[];
  createdAt: string;
}

export interface ImportJob {
  id: string;
  fileName: string;
  status: string;
  headerRow: number;
  headers: string[];
  suggestedMapping: Record<string, string>;
  preview: Record<string, string>[];
  totalRows: number;
  processedRows: number;
  importedRows: number;
  duplicateRows: number;
  failedRows: number;
  rowErrors: { row: number; message: string }[];
  failureReason?: string;
  createdAt: string;
  completedAt: string | null;
}

export interface BankTransaction {
  id: string;
  transactionDate: string;
  description: string;
  reference?: string;
  amountMinor: number;
  direction: 'CREDIT' | 'DEBIT';
  status: string;
  paymentId: string | null;
}

export interface Signal {
  code: string;
  points: number;
  detail: string;
}

export interface Match {
  id: string;
  kind: 'PAYMENT' | 'INVOICE' | 'INVOICE_GROUP';
  status: string;
  score: number;
  signals: Signal[];
  blocks: string[];
  partial: boolean;
  bankTransactionId: BankTransaction;
  customerId?: { id: string; name: string };
  invoiceIds: { id: string; invoiceNumber: string; totalMinor: number; allocatedMinor: number }[];
  invoiceAmountsMinor: number[];
  paymentId?: { id: string; paymentNumber: string; reference?: string; amountMinor: number } | null;
  decision?: string;
  note?: string;
  createdAt: string;
}

export interface ReconException {
  id: string;
  status: 'OPEN' | 'RESOLVED';
  reason: string;
  bankTransactionId: BankTransaction;
  assigneeId: { id: string; name: string } | null;
  comments: { userId: { id: string; name: string } | string; body: string; createdAt: string }[];
  openedAt: string;
  resolvedAt: string | null;
  resolution?: string;
  resolutionMinutes: number | null;
}

export interface Communication {
  id: string;
  kind: string;
  to: string;
  subject: string;
  status: string;
  scheduledAt: string;
  sentAt: string | null;
  lastError?: string;
  customerId: CustomerRef;
  invoiceIds: { id: string; invoiceNumber: string }[];
  createdAt: string;
}

export interface AppNotification {
  id: string;
  type: string;
  title: string;
  body?: string;
  link?: string;
  readAt: string | null;
  createdAt: string;
}

export interface Member {
  id: string;
  role: string;
  status: string;
  joinedAt: string;
  user: { id: string; name: string; email: string; emailVerified: boolean } | null;
}

export interface Organization {
  id: string;
  name: string;
  slug: string;
  currency: string;
  timezone: string;
  email?: string;
  phone?: string;
  gstin?: string;
  address?: string;
  logoKey?: string;
  role?: string;
}

export const refName = (ref: CustomerRef | string | null | undefined) =>
  typeof ref === 'object' && ref ? ref.name : '—';
export const refId = (ref: { id: string } | string | null | undefined) =>
  typeof ref === 'object' && ref ? ref.id : (ref ?? '');
