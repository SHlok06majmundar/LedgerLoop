export const Role = {
  OWNER: 'OWNER',
  ADMIN: 'ADMIN',
  ACCOUNTANT: 'ACCOUNTANT',
  MANAGER: 'MANAGER',
  STAFF: 'STAFF',
  VIEWER: 'VIEWER',
} as const;
export type Role = (typeof Role)[keyof typeof Role];

export const MemberStatus = {
  ACTIVE: 'ACTIVE',
  DISABLED: 'DISABLED',
} as const;
export type MemberStatus = (typeof MemberStatus)[keyof typeof MemberStatus];

export const InvoiceStatus = {
  DRAFT: 'DRAFT',
  ISSUED: 'ISSUED',
  PARTIALLY_PAID: 'PARTIALLY_PAID',
  PAID: 'PAID',
  OVERDUE: 'OVERDUE',
  VOID: 'VOID',
} as const;
export type InvoiceStatus = (typeof InvoiceStatus)[keyof typeof InvoiceStatus];

export const PaymentMethod = {
  UPI: 'UPI',
  NEFT: 'NEFT',
  RTGS: 'RTGS',
  IMPS: 'IMPS',
  BANK_TRANSFER: 'BANK_TRANSFER',
  CASH: 'CASH',
  CHEQUE: 'CHEQUE',
} as const;
export type PaymentMethod = (typeof PaymentMethod)[keyof typeof PaymentMethod];

export const PaymentStatus = {
  POSTED: 'POSTED',
  REVERSED: 'REVERSED',
} as const;
export type PaymentStatus = (typeof PaymentStatus)[keyof typeof PaymentStatus];

export const ImportJobStatus = {
  AWAITING_MAPPING: 'AWAITING_MAPPING',
  QUEUED: 'QUEUED',
  PROCESSING: 'PROCESSING',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
} as const;
export type ImportJobStatus = (typeof ImportJobStatus)[keyof typeof ImportJobStatus];

export const ReconciliationStatus = {
  UNMATCHED: 'UNMATCHED',
  SUGGESTED: 'SUGGESTED',
  MATCHED: 'MATCHED',
  PARTIALLY_MATCHED: 'PARTIALLY_MATCHED',
  DISCREPANCY: 'DISCREPANCY',
  REJECTED: 'REJECTED',
  IGNORED: 'IGNORED',
} as const;
export type ReconciliationStatus = (typeof ReconciliationStatus)[keyof typeof ReconciliationStatus];

export const RunStatus = {
  RUNNING: 'RUNNING',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
} as const;
export type RunStatus = (typeof RunStatus)[keyof typeof RunStatus];

export const ReminderKind = {
  UPCOMING: 'UPCOMING',
  DUE_TODAY: 'DUE_TODAY',
  OVERDUE: 'OVERDUE',
  ESCALATION: 'ESCALATION',
  MANUAL: 'MANUAL',
} as const;
export type ReminderKind = (typeof ReminderKind)[keyof typeof ReminderKind];

export const NotificationStatus = {
  SCHEDULED: 'SCHEDULED',
  SENT: 'SENT',
  FAILED: 'FAILED',
  CANCELLED: 'CANCELLED',
} as const;
export type NotificationStatus = (typeof NotificationStatus)[keyof typeof NotificationStatus];
