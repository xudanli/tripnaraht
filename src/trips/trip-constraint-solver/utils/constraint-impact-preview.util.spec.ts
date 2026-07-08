import { TRIP_CONSTRAINT_LEGACY_IDS } from '../types/trip-constraint.types';
import type { PlanningConflictItem } from '../types/planning-conflicts.types';
import { buildStructuredConstraintImpactPreview } from './constraint-impact-preview.util';

describe('constraint-impact-preview.util', () => {
  const driveConflict: PlanningConflictItem = {
    id: 'c-drive-1',
    source: 'feasibility',
    priority: 'must_handle',
    category: 'transport',
    title: 'Day 2 驾驶超限',
    message: 'daily_drive exceeded on day 2',
    affectedDays: [2],
    issue: {
      id: 'issue-drive',
      priority: 'must_handle',
      category: 'transport',
      title: '驾驶超限',
      message: 'daily_drive',
      affectedDays: [2],
      issueKind: 'daily_drive',
      anchors: { removableItemId: 'item-poi-1', fromDayNumber: 2 },
    },
  };

  it('builds bullets for tightening max daily drive', () => {
    const preview = buildStructuredConstraintImpactPreview({
      changes: [
        {
          constraintId: TRIP_CONSTRAINT_LEGACY_IDS.MAX_DAILY_DRIVE,
          patch: { value: 3 },
        },
      ],
      items: [
        {
          id: TRIP_CONSTRAINT_LEGACY_IDS.MAX_DAILY_DRIVE,
          tripId: 't1',
          name: '每日驾驶上限',
          category: 'TRANSPORT',
          type: 'HARD',
          status: 'ACTIVE',
          scope: { type: 'TRIP' },
          operator: 'LTE',
          value: 5,
          unit: 'hour',
          allowRelaxation: true,
          locked: false,
          source: { type: 'USER' },
          visibility: 'TEAM',
        },
      ],
      conflictsBefore: [driveConflict],
      assessBefore: {
        overallAverageScore: 86,
        overallGrade: 'GOOD',
        reasonableDays: 5,
        hasIssuesDays: 1,
        plannedDays: 7,
      },
    });

    expect(preview.summaryBullets.some((b) => b.includes('第 2 天'))).toBe(true);
    expect(preview.summaryBullets.some((b) => b.includes('86'))).toBe(true);
    expect(preview.schedule?.daysNeedingSplit).toEqual([2]);
    expect(preview.constraintChanges[0]?.before).toBe(5);
    expect(preview.constraintChanges[0]?.after).toBe(3);
  });

  it('builds budget pct bullet', () => {
    const preview = buildStructuredConstraintImpactPreview({
      changes: [
        {
          constraintId: TRIP_CONSTRAINT_LEGACY_IDS.BUDGET_TOTAL,
          patch: { value: 12000 },
        },
      ],
      items: [
        {
          id: TRIP_CONSTRAINT_LEGACY_IDS.BUDGET_TOTAL,
          tripId: 't1',
          name: '总预算',
          category: 'BUDGET',
          type: 'HARD',
          status: 'ACTIVE',
          scope: { type: 'TRIP' },
          operator: 'LTE',
          value: 10000,
          unit: 'CNY',
          allowRelaxation: false,
          locked: false,
          source: { type: 'USER' },
          visibility: 'TEAM',
        },
      ],
      conflictsBefore: [],
      budgetDelta: { amount: 2000, currency: 'CNY' },
      budgetTotalBefore: 10000,
    });

    expect(preview.budget?.deltaPct).toBe(20);
    expect(preview.summaryBullets.some((b) => b.includes('20%'))).toBe(true);
  });
});
