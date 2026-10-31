import { Permission, hasPermission } from './permissions';

describe('hasPermission', () => {
  it('lets only the owner change organization settings', () => {
    expect(hasPermission('OWNER', Permission.ORGANIZATION_MANAGE)).toBe(true);
    expect(hasPermission('ADMIN', Permission.ORGANIZATION_MANAGE)).toBe(false);
  });

  it('lets admins manage members but not accountants', () => {
    expect(hasPermission('ADMIN', Permission.MEMBERS_MANAGE)).toBe(true);
    expect(hasPermission('ACCOUNTANT', Permission.MEMBERS_MANAGE)).toBe(false);
  });

  it('lets managers approve matches without recording payments', () => {
    expect(hasPermission('MANAGER', Permission.RECONCILIATION_APPROVE)).toBe(true);
    expect(hasPermission('MANAGER', Permission.PAYMENTS_WRITE)).toBe(false);
  });

  it('lets staff draft invoices but not issue or void them', () => {
    expect(hasPermission('STAFF', Permission.INVOICES_WRITE)).toBe(true);
    expect(hasPermission('STAFF', Permission.INVOICES_ISSUE)).toBe(false);
    expect(hasPermission('STAFF', Permission.INVOICES_VOID)).toBe(false);
  });

  it('keeps viewers read-only', () => {
    expect(hasPermission('VIEWER', Permission.INVOICES_READ)).toBe(true);
    expect(hasPermission('VIEWER', Permission.CUSTOMERS_WRITE)).toBe(false);
  });
});
