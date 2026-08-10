import {
  auditPlanningConflictsAffectedDays,
  formatAffectedDaysAuditLines,
  resolveConflictAffectedDayNumbers,
} from './affected-day-numbers-audit.util';
import {
  normalizePlanningAffectedDayNumbers,
  parseScheduleAffectedDayNumbers,
} from './planning-conflicts.util';
import type { PlanningConflictItem } from '../types/planning-conflicts.types';

function item(
  partial: Partial<PlanningConflictItem> & Pick<PlanningConflictItem, 'id' | 'title'>,
): PlanningConflictItem {
  return {
    source: 'feasibility',
    priority: 'suggest_adjust',
    category: 'schedule',
    message: '',
    ...partial,
  };
}

describe('affectedDayNumbers iOS Day-bar contract', () => {
  it('skips ISO calendar dates (do not parse year as day)', () => {
    expect(parseScheduleAffectedDayNumbers(['2026-07-19', '3'])).toEqual([3]);
    expect(
      normalizePlanningAffectedDayNumbers({ affectedDays: ['2026-08-01'] }),
    ).toEqual([]);
  });

  it('keeps empty as trip-level (never expands to 1..N)', () => {
    expect(
      normalizePlanningAffectedDayNumbers({
        affectedDays: [],
        tripDayCount: 7,
      }),
    ).toEqual([]);
  });

  it('uses 1-based Day indices', () => {
    expect(
      normalizePlanningAffectedDayNumbers({
        affectedDays: [3],
        fromDayNumber: 3,
      }),
    ).toEqual([3]);
  });

  it('audits all-days-filled as unhealthy', () => {
    const conflicts = [
      item({
        id: 'c1',
        title: 'bad',
        affectedDayNumbers: [1, 2, 3, 4],
      }),
      item({
        id: 'c2',
        title: 'ok',
        affectedDayNumbers: [3],
      }),
    ];
    const report = auditPlanningConflictsAffectedDays({
      tripDayCount: 4,
      conflicts,
    });
    expect(report.unhealthy).toBe(true);
    expect(report.findings.some((f) => f.kind === 'all_days_filled')).toBe(true);
    expect(resolveConflictAffectedDayNumbers(conflicts[1])).toEqual([3]);
    const lines = formatAffectedDaysAuditLines(report);
    expect(lines[0]).toContain('c1');
    expect(lines[1]).toContain('[3]');
  });
});
