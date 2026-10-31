import { agingBucket, lastMonths } from './buckets';

describe('agingBucket', () => {
  it.each([
    [-5, 'NOT_DUE'],
    [0, 'NOT_DUE'],
    [1, 'DAYS_1_30'],
    [30, 'DAYS_1_30'],
    [31, 'DAYS_31_60'],
    [60, 'DAYS_31_60'],
    [61, 'DAYS_61_90'],
    [90, 'DAYS_61_90'],
    [91, 'DAYS_90_PLUS'],
    [400, 'DAYS_90_PLUS'],
  ])('%i days past due is %s', (days, bucket) => {
    expect(agingBucket(days)).toBe(bucket);
  });
});

describe('lastMonths', () => {
  it('lists months oldest first, across a year end', () => {
    expect(lastMonths('2027-02-10', 4)).toEqual(['2026-11', '2026-12', '2027-01', '2027-02']);
  });
});
