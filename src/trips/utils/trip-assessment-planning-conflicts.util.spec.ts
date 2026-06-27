import type { DayAssessmentDto } from '../dto/trip-metrics.dto';
import { AssessmentDimension, AssessmentStatus, DayType } from '../dto/trip-metrics.dto';
import type { PlanningConflictItem } from '../trip-constraint-solver/types/planning-conflicts.types';
import {
  buildFeasibilityDimensionAssessment,
  buildTripDayIndexMaps,
  capTripGradeForPlanningConflicts,
  dedupePlanningConflictItems,
  groupPlanningConflictsByDate,
  integratePlanningConflictsIntoDay,
  integratePlanningConflictsIntoDays,
  resolvePlanningConflictDates,
} from './trip-assessment-planning-conflicts.util';

describe('trip-assessment-planning-conflicts.util', () => {
  const tripDays = [
    {
      id: 'day-1',
      date: new Date('2026-06-20T00:00:00.000Z'),
      ItineraryItem: [{ id: 'item-a' }],
    },
    {
      id: 'day-2',
      date: new Date('2026-06-21T00:00:00.000Z'),
      ItineraryItem: [{ id: 'item-b' }],
    },
  ];

  const baseDay: DayAssessmentDto = {
    date: '2026-06-20',
    dayType: DayType.TOURING_DAY,
    status: AssessmentStatus.REASONABLE,
    activityCount: 3,
    activeDurationHours: 5,
    overallScore: 92,
    overallGrade: 'EXCELLENT',
    isReasonable: true,
    criticalIssueCount: 0,
    warningCount: 0,
    dimensions: [
      {
        dimension: AssessmentDimension.TRANSPORT,
        name: '交通效率',
        score: 90,
        grade: 'EXCELLENT',
        passed: true,
        description: 'ok',
      },
    ],
  };

  it('maps day index to ISO date', () => {
    const maps = buildTripDayIndexMaps(tripDays);
    expect(maps.indexToDate.get(1)).toBe('2026-06-20');
    expect(maps.itemIdToDate.get('item-b')).toBe('2026-06-21');
  });

  it('downgrades day with must_handle conflict and adds FEASIBILITY dimension', () => {
    const mustItem: PlanningConflictItem = {
      id: 'c1',
      source: 'schedule',
      priority: 'must_handle',
      category: 'transport',
      title: '交通时间不足',
      message: '缓冲不足',
      affectedDays: [1],
    };

    const adjusted = integratePlanningConflictsIntoDay(baseDay, [mustItem]);
    expect(adjusted.status).toBe(AssessmentStatus.HAS_ISSUES);
    expect(adjusted.isReasonable).toBe(false);
    expect(adjusted.overallScore).toBeLessThanOrEqual(49);
    expect(adjusted.planningConflicts?.mustHandleCount).toBe(1);
    expect(adjusted.dimensions?.some((d) => d.dimension === AssessmentDimension.FEASIBILITY)).toBe(
      true,
    );
  });

  it('downgrades REASONABLE day with suggest_adjust to NEEDS_ATTENTION', () => {
    const suggestItem: PlanningConflictItem = {
      id: 'c2',
      source: 'schedule',
      priority: 'suggest_adjust',
      category: 'transport',
      title: '交通偏长',
      message: '可优化顺序',
      affectedDays: [1],
    };

    const adjusted = integratePlanningConflictsIntoDay(baseDay, [suggestItem]);
    expect(adjusted.status).toBe(AssessmentStatus.NEEDS_ATTENTION);
    expect(adjusted.isReasonable).toBe(false);
    expect(adjusted.overallScore).toBeLessThanOrEqual(74);
    expect(adjusted.planningConflicts?.suggestAdjustCount).toBe(1);
    expect(buildFeasibilityDimensionAssessment([suggestItem]).score).toBe(60);
  });

  it('caps trip grade for must vs suggest', () => {
    expect(capTripGradeForPlanningConflicts(95, { mustHandle: 2, suggestAdjust: 0 }).overallGrade).toBe(
      'FAIR',
    );
    expect(
      capTripGradeForPlanningConflicts(95, { mustHandle: 0, suggestAdjust: 3 }).overallGrade,
    ).toBe('GOOD');
  });

  it('resolves conflict date from affected item id', () => {
    const maps = buildTripDayIndexMaps(tripDays);
    const dates = resolvePlanningConflictDates(
      {
        id: 'x',
        source: 'schedule',
        priority: 'must_handle',
        category: 'schedule',
        title: '重叠',
        message: '时间冲突',
        studioConflict: {
          id: 's1',
          type: 'TIME_CONFLICT' as never,
          severity: 'HIGH' as never,
          title: '重叠',
          description: '时间冲突',
          affectedDays: [],
          affectedItemIds: ['item-b'],
        },
      },
      maps,
    );
    expect(dates).toEqual(['2026-06-21']);
  });

  it('integrates conflicts only on affected dates', () => {
    const maps = buildTripDayIndexMaps(tripDays);
    const byDate = groupPlanningConflictsByDate(
      [
        {
          id: 'c1',
          source: 'feasibility',
          priority: 'suggest_adjust',
          category: 'transport',
          title: 'day1 suggest',
          message: 'fix',
          affectedDays: [1],
        },
      ],
      maps,
    );

    const days: DayAssessmentDto[] = [
      { ...baseDay },
      {
        ...baseDay,
        date: '2026-06-21',
        overallScore: 88,
        overallGrade: 'GOOD',
      },
    ];

    const adjusted = integratePlanningConflictsIntoDays(days, byDate);
    expect(adjusted.days[0].status).toBe(AssessmentStatus.NEEDS_ATTENTION);
    expect(adjusted.days[1].status).toBe(AssessmentStatus.REASONABLE);
  });

  it('dedupes cross-day title variants keeping suggest over pending', () => {
    const deduped = dedupePlanningConflictItems([
      {
        id: 'p',
        source: 'feasibility',
        priority: 'pending_confirm',
        category: 'transport',
        title: '第1天 · 钻石沙滩 → 塞济斯菲厄泽 · 跨天行程，请合理安排出发时间',
        message: 'pending',
      },
      {
        id: 's',
        source: 'schedule',
        priority: 'suggest_adjust',
        category: 'transport',
        title: '第1天 · 钻石沙滩 → 塞济斯菲厄泽（约 186 km）· 跨天行程，请合理安排出发时间',
        message: 'suggest',
      },
    ]);
    expect(deduped).toHaveLength(1);
    expect(deduped[0].priority).toBe('suggest_adjust');
  });

  it('keeps trip-wide conflicts out of every day', () => {
    const maps = buildTripDayIndexMaps(tripDays);
    const byDate = groupPlanningConflictsByDate(
      [
        {
          id: 'trip-wide',
          source: 'feasibility',
          priority: 'pending_confirm',
          category: 'team_fit',
          title: '成员决策画像未齐',
          message: '请补齐',
        },
      ],
      maps,
    );

    const days: DayAssessmentDto[] = [
      { ...baseDay },
      { ...baseDay, date: '2026-06-21', overallScore: 88, overallGrade: 'GOOD' },
    ];

    const result = integratePlanningConflictsIntoDays(days, byDate);
    expect(result.tripWideConflicts).toHaveLength(1);
    expect(result.days.every((d) => d.status === AssessmentStatus.REASONABLE)).toBe(true);
    expect(result.days.every((d) => !d.dimensions?.some((x) => x.dimension === AssessmentDimension.FEASIBILITY))).toBe(
      true,
    );
  });
});
