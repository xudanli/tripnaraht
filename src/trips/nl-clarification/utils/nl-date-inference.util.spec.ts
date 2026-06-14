import {
  extractExplicitMonthsFromText,
  sanitizeNlInferredDates,
} from './nl-date-inference.util';

describe('nl-date-inference.util', () => {
  it('extracts Chinese and English month mentions', () => {
    expect(extractExplicitMonthsFromText('我想十一月去冰岛')).toEqual([{ month: 11 }]);
    expect(extractExplicitMonthsFromText('plan for November 2026')).toEqual([
      { month: 11, year: 2026 },
    ]);
  });

  it('clears near-term inferred dates when user mentioned a future month', () => {
    const today = new Date('2026-06-14T12:00:00');
    const params = {
      destination: 'IS',
      startDate: '2026-06-14',
      endDate: '2026-06-20',
      totalBudget: 30000,
      inferredFields: ['startDate', 'endDate', 'totalBudget'],
    };
    const result = sanitizeNlInferredDates(params, ['十一月自驾冰岛 7 天']);
    expect(result.datesRejected).toBe(true);
    expect(result.params.startDate).toBeUndefined();
    expect(result.params.endDate).toBeUndefined();
    expect(result.params.inferredFields).toEqual(['totalBudget']);
    expect(result.reason).toBe('explicit_month_mismatch');

    // sanity: would reject with fixed "today" in util — daysUntil uses real Date;
    // re-run with explicit mismatch only
    expect(
      sanitizeNlInferredDates(
        { ...params, startDate: '2026-11-01', endDate: '2026-11-07' },
        ['十一月自驾冰岛'],
      ).datesRejected,
    ).toBe(false);
  });

  it('keeps inferred dates when user signals near-term intent', () => {
    const params = {
      startDate: '2026-06-15',
      endDate: '2026-06-20',
      inferredFields: ['startDate', 'endDate'],
    };
    const result = sanitizeNlInferredDates(params, ['最近想去冰岛玩一周']);
    expect(result.datesRejected).toBe(false);
  });
});
