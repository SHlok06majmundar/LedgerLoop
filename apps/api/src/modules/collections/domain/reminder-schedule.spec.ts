import { DEFAULT_RULES, dueReminderStep, reminderKey } from './reminder-schedule';

describe('dueReminderStep', () => {
  const invoice = { dueDate: '2026-11-15' };

  it.each([
    ['2026-11-11', null],
    ['2026-11-12', { offsetDays: -3, kind: 'UPCOMING' }],
    ['2026-11-14', { offsetDays: -3, kind: 'UPCOMING' }],
    ['2026-11-15', { offsetDays: 0, kind: 'DUE_TODAY' }],
    ['2026-11-18', { offsetDays: 3, kind: 'OVERDUE' }],
    ['2026-11-22', { offsetDays: 7, kind: 'OVERDUE' }],
    ['2026-11-30', { offsetDays: 15, kind: 'ESCALATION' }],
    ['2027-03-01', { offsetDays: 15, kind: 'ESCALATION' }],
  ])('on %s the current step is %j', (today, expected) => {
    expect(dueReminderStep(invoice, DEFAULT_RULES, today)).toEqual(expected);
  });

  it('follows custom rules in any order', () => {
    const rules = [
      { offsetDays: 30, kind: 'ESCALATION' as const },
      { offsetDays: 1, kind: 'OVERDUE' as const },
    ];

    expect(dueReminderStep(invoice, rules, '2026-11-20')).toEqual({
      offsetDays: 1,
      kind: 'OVERDUE',
    });
  });
});

describe('reminderKey', () => {
  it('identifies one step of one invoice', () => {
    expect(reminderKey('inv1', { offsetDays: 7, kind: 'OVERDUE' })).toBe('inv1:OVERDUE:7');
    expect(reminderKey('inv1', { offsetDays: -3, kind: 'UPCOMING' })).toBe('inv1:UPCOMING:-3');
  });
});
