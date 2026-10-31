import { Role } from './enums';

export const Permission = {
  ORGANIZATION_MANAGE: 'organization:manage',
  MEMBERS_MANAGE: 'members:manage',
  CUSTOMERS_READ: 'customers:read',
  CUSTOMERS_WRITE: 'customers:write',
  INVOICES_READ: 'invoices:read',
  INVOICES_WRITE: 'invoices:write',
  INVOICES_ISSUE: 'invoices:issue',
  INVOICES_VOID: 'invoices:void',
  PAYMENTS_READ: 'payments:read',
  PAYMENTS_WRITE: 'payments:write',
  PAYMENTS_REVERSE: 'payments:reverse',
  IMPORTS_WRITE: 'imports:write',
  RECONCILIATION_READ: 'reconciliation:read',
  RECONCILIATION_RUN: 'reconciliation:run',
  RECONCILIATION_APPROVE: 'reconciliation:approve',
  COLLECTIONS_MANAGE: 'collections:manage',
  ANALYTICS_READ: 'analytics:read',
  AUDIT_READ: 'audit:read',
} as const;
export type Permission = (typeof Permission)[keyof typeof Permission];

const P = Permission;

const READ_ALL: Permission[] = [
  P.CUSTOMERS_READ,
  P.INVOICES_READ,
  P.PAYMENTS_READ,
  P.RECONCILIATION_READ,
  P.ANALYTICS_READ,
];

const FINANCE: Permission[] = [
  ...READ_ALL,
  P.CUSTOMERS_WRITE,
  P.INVOICES_WRITE,
  P.INVOICES_ISSUE,
  P.INVOICES_VOID,
  P.PAYMENTS_WRITE,
  P.PAYMENTS_REVERSE,
  P.IMPORTS_WRITE,
  P.RECONCILIATION_RUN,
  P.RECONCILIATION_APPROVE,
  P.COLLECTIONS_MANAGE,
];

export const ROLE_PERMISSIONS: Record<Role, ReadonlySet<Permission>> = {
  OWNER: new Set(Object.values(P)),
  ADMIN: new Set([...FINANCE, P.MEMBERS_MANAGE, P.AUDIT_READ]),
  ACCOUNTANT: new Set([...FINANCE, P.AUDIT_READ]),
  MANAGER: new Set([...READ_ALL, P.RECONCILIATION_APPROVE, P.AUDIT_READ]),
  STAFF: new Set([
    P.CUSTOMERS_READ,
    P.CUSTOMERS_WRITE,
    P.INVOICES_READ,
    P.INVOICES_WRITE,
    P.PAYMENTS_READ,
  ]),
  VIEWER: new Set(READ_ALL),
};

export function hasPermission(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].has(permission);
}
