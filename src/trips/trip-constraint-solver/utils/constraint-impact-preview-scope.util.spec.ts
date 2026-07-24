import { TRIP_CONSTRAINT_LEGACY_IDS } from '../types/trip-constraint.types';
import type { PlanningConflictItem } from '../types/planning-conflicts.types';
import {
  conflictsForConstraint,
  simulateScopedPreview,
  summarizeConflictBuckets,
} from './constraint-impact-preview-scope.util';

describe('constraint-impact-preview-scope.util', () => {
  const driveConflict: PlanningConflictItem = {
    id: 'drive-1',
    source: 'feasibility',
    priority: 'must_handle',
    category: 'transport',
    title: '每日驾驶上限',
    message: 'daily_drive exceeded day 1',
    affectedDays: [1],
    issue: {
      id: 'issue-1',
      priority: 'must_handle',
      category: 'transport',
      title: '驾驶超限',
      message: 'daily_drive',
      affectedDays: [1],
      severity: 'high',
      issueKind: 'daily_drive',
      anchors: { travelMinutes: 1286 },
    },
  };

  const budgetConflict: PlanningConflictItem = {
    id: 'budget-1',
    source: 'feasibility',
    priority: 'must_handle',
    category: 'other',
    title: '预算不足',
    message: '超出总预算上限',
    affectedDays: [2],
  };

  const paceConflict: PlanningConflictItem = {
    id: 'pace-1',
    source: 'feasibility',
    priority: 'suggest_adjust',
    category: 'schedule',
    title: '第 3 天节奏偏紧',
    message: '行程偏紧建议减少景点',
    affectedDays: [3],
    issue: {
      id: 'pace-issue',
      priority: 'suggest_adjust',
      category: 'schedule',
      title: '节奏偏紧',
      message: '偏紧',
      affectedDays: [3],
      severity: 'medium',
      issueKind: 'team_pacing_fatigue',
    },
  };

  it('conflictsForConstraint filters by related constraint id', () => {
    const scoped = conflictsForConstraint(TRIP_CONSTRAINT_LEGACY_IDS.MAX_DAILY_DRIVE, [
      driveConflict,
      budgetConflict,
    ]);
    expect(scoped).toHaveLength(1);
    expect(scoped[0]?.id).toBe('drive-1');
  });

  it('MAX_DAILY_DRIVE tighten simulates scoped mustHandle after', () => {
    const preview = simulateScopedPreview({
      constraintId: TRIP_CONSTRAINT_LEGACY_IDS.MAX_DAILY_DRIVE,
      changes: [
        { constraintId: TRIP_CONSTRAINT_LEGACY_IDS.MAX_DAILY_DRIVE, patch: { value: 5 } },
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
          value: 6,
          unit: 'hour',
          allowRelaxation: true,
          locked: false,
          source: { type: 'USER' },
          visibility: 'TEAM',
        },
      ],
      allConflicts: [driveConflict, budgetConflict, paceConflict],
      tripDayCount: 4,
      assessBefore: {
        overallAverageScore: 49,
        overallGrade: 'POOR',
        reasonableDays: 0,
        hasIssuesDays: 1,
        plannedDays: 4,
      },
    });

    expect(preview.conflictsBefore.mustHandle).toBe(1);
    expect(preview.conflictsAfter.mustHandle).toBe(1);
    expect(preview.affectedDays).toEqual([1]);
    expect(preview.estimatedScoreDelta).toBe(-5);
    expect(summarizeConflictBuckets([driveConflict, budgetConflict, paceConflict]).mustHandle).toBe(2);
  });

  it('PACING_LEVEL relaxed simulates different suggestAdjust delta than drive', () => {
    const preview = simulateScopedPreview({
      constraintId: TRIP_CONSTRAINT_LEGACY_IDS.PACING_LEVEL,
      changes: [{ constraintId: TRIP_CONSTRAINT_LEGACY_IDS.PACING_LEVEL, patch: { value: 'relaxed' } }],
      items: [
        {
          id: TRIP_CONSTRAINT_LEGACY_IDS.PACING_LEVEL,
          tripId: 't1',
          name: '行程节奏',
          category: 'ACTIVITY',
          type: 'SOFT',
          status: 'ACTIVE',
          scope: { type: 'TRIP' },
          operator: 'EQ',
          value: 'intensive',
          allowRelaxation: true,
          locked: false,
          source: { type: 'USER' },
          visibility: 'TEAM',
        },
      ],
      allConflicts: [driveConflict, budgetConflict, paceConflict],
      tripDayCount: 4,
    });

    expect(preview.conflictsBefore.suggestAdjust).toBe(1);
    expect(preview.conflictsAfter.suggestAdjust).toBe(0);
    expect(preview.affectedDays).toEqual([3]);
  });
});
