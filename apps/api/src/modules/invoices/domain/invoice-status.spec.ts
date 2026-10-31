import { addDays, deriveStatus, todayIn } from './invoice-status';

describe('deriveStatus', () => {
  const issued = { status: 'ISSUED' as const, totalMinor: 10_000, dueDate: '2026-11-15' };

  it('keeps drafts and voided invoices as they are', () => {
    expect(deriveStatus({ ...issued, status: 'DRAFT', allocatedMinor: 0 }, '2026-12-01')).toBe(
      'DRAFT',
    );
    expect(deriveStatus({ ...issued, status: 'VOID', allocatedMinor: 0 }, '2026-12-01')).toBe(
      'VOID',
    );
  });

  it('is issued while unpaid and not yet due', () => {
    expect(deriveStatus({ ...issued, allocatedMinor: 0 }, '2026-11-15')).toBe('ISSUED');
  });

  it('is partially paid when some money is allocated before the due date', () => {
    expect(deriveStatus({ ...issued, allocatedMinor: 4_000 }, '2026-11-01')).toBe('PARTIALLY_PAID');
  });

  it('is overdue the day after the due date while anything is outstanding', () => {
    expect(deriveStatus({ ...issued, allocatedMinor: 0 }, '2026-11-16')).toBe('OVERDUE');
    expect(deriveStatus({ ...issued, allocatedMinor: 9_999 }, '2026-11-16')).toBe('OVERDUE');
  });

  it('is paid once fully allocated, even after the due date', () => {
    expect(deriveStatus({ ...issued, allocatedMinor: 10_000 }, '2027-01-01')).toBe('PAID');
  });

  it('goes back to issued when a reversal removes all allocations', () => {
    expect(deriveStatus({ ...issued, status: 'PAID', allocatedMinor: 0 }, '2026-11-01')).toBe(
      'ISSUED',
    );
  });
});

describe('calendar helpers', () => {
  it('adds days across month and year ends', () => {
    expect(addDays('2026-12-20', 30)).toBe('2027-01-19');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
  });

  it('reads today in the organization timezone', () => {
    // 2026-10-31 20:00 UTC is already 1 November in India.
    const instant = new Date('2026-10-31T20:00:00Z');
    expect(todayIn('Asia/Kolkata', instant)).toBe('2026-11-01');
    expect(todayIn('UTC', instant)).toBe('2026-10-31');
  });
});
