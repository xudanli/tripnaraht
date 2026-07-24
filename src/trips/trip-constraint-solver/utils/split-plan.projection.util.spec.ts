import type { FeasibilityIssueDto } from '../types/trip-constraint-solver.types';
import type { ConstraintsSummaryResponse } from '../types/constraints-summary.types';
import type { SplitPlanScheduleSource } from './split-plan-schedule.source.util';
import {
  appendSplitSnapshotSuffix,
  projectSplitPlanBundle,
  readAppliedSplitPlanIds,
} from './split-plan.projection.util';

function makeConstraintsSummary(): ConstraintsSummaryResponse {
  return {
    tripId: 'trip-1',
    constraintsVersion: 8,
    confirmedAt: null,
    confirmedBy: null,
    isUserConfirmed: false,
    isVersionConfirmed: false,
    allReady: true,
    pendingCount: 0,
    timeRange: { startDate: null, endDate: null, dayCount: 3, status: 'missing' },
    budget: { total: 10000, currency: 'CNY', status: 'confirmed' },
    travelers: { count: 12, memberCount: 12, profilingCompletedCount: 10, status: 'confirmed' },
    transport: { travelMode: 'self_drive', transportHint: null, status: 'confirmed' },
    pendingItems: [],
  };
}

function makeSchedule(): SplitPlanScheduleSource {
  return {
    tripId: 'trip-1',
    totalMemberCount: 12,
    memberCluster: {
      groupA: {
        memberIds: ['u1', 'u2', 'u3', 'u4', 'u5', 'u6', 'u7', 'u8'],
        label: 'Alice、Bob 等 8 人 · 体能较好',
        members: [
          { id: 'u1', displayName: 'danli xu' },
          { id: 'u2', displayName: 'Danny' },
        ],
      },
      groupB: {
        memberIds: ['u9', 'u10', 'u11', 'u12'],
        label: 'Carol、Dave 等 4 人 · 节奏保守',
        members: [{ id: 'u9', displayName: 'Carol' }],
      },
    },
    days: [
      {
        tripDayId: 'day-3',
        dayNumber: 3,
        dayIndex: 2,
        dateLabel: '2026-07-03',
        items: [
          {
            id: 'item-depart',
            tripDayId: 'day-3',
            dayNumber: 3,
            dayIndex: 2,
            type: 'TRANSIT',
            title: 'Skógafoss 停靠',
            startTime: '08:00',
            endTime: '10:20',
            startMs: 8 * 3600000,
            endMs: 10.33 * 3600000,
            intensity: 'low',
            riskLevel: 'low',
          },
          {
            id: 'item-hike',
            tripDayId: 'day-3',
            dayNumber: 3,
            dayIndex: 2,
            type: 'ACTIVITY',
            title: '冰川徒步体验',
            placeName: 'Sólheimajökull',
            subtitle: 'Solheimajokull 冰川向导',
            startTime: '11:00',
            endTime: '15:30',
            startMs: 11 * 3600000,
            endMs: 15.5 * 3600000,
            intensity: 'high',
            riskLevel: 'medium',
            trailId: 42,
            costPerPerson: '¥880/人',
            estimatedCost: 880,
            currency: 'CNY',
            note: '含冰爪与头盔',
          },
          {
            id: 'item-rest',
            tripDayId: 'day-3',
            dayNumber: 3,
            dayIndex: 2,
            type: 'REST',
            title: '咖啡店休息',
            startTime: '11:00',
            endTime: '15:30',
            startMs: 11 * 3600000,
            endMs: 15.5 * 3600000,
            intensity: 'low',
            riskLevel: 'low',
            costPerPerson: '¥220/人',
            estimatedCost: 220,
            currency: 'CNY',
          },
          {
            id: 'item-dinner',
            tripDayId: 'day-3',
            dayNumber: 3,
            dayIndex: 2,
            type: 'MEAL_ANCHOR',
            title: 'Skógafoss 酒店餐厅',
            startTime: '17:30',
            endTime: '19:00',
            startMs: 17.5 * 3600000,
            endMs: 19 * 3600000,
            intensity: 'low',
            riskLevel: 'low',
          },
        ],
      },
    ],
  };
}

function makeFatigueIssue(): FeasibilityIssueDto {
  return {
    id: 'issue-team-fit-fatigue-c1',
    priority: 'suggest_adjust',
    category: 'team_fit',
    issueKind: 'team_pacing_fatigue',
    title: '高强度日 · 成员体能风险',
    message: 'Day 3 冰川徒步预计疲劳超标；多人同行时需确认最弱体能成员能否承受',
    affectedDays: [3],
    severity: 'high',
    fromItemId: 'item-hike',
    proofs: [
      {
        entity: '团队节奏',
        constraint: 'fatigue_capacity',
        currentFact: 'Day 3 高强度',
        evidenceSource: 'trip-conflicts',
        evidenceType: 'fatigue_exceeded',
        conclusion: '建议分流',
        ruleId: 'team_fit.fatigue.group_capacity',
        confidence: 0.8,
        placeLabel: 'Skógafoss 酒店餐厅',
      },
    ],
  };
}

function makeReport(issue: FeasibilityIssueDto) {
  return {
    tripId: 'trip-1',
    tripTitle: 'Iceland',
    verdict: { status: 'ADJUST_REQUIRED' as const, headline: '需调整' },
    overallScore: 72,
    verifiedForTripVersion: 'v2',
    currentTripVersion: 'v2',
    isStale: false,
    canStartExecute: false,
    gateExecute: { blocked: false, reasons: [] },
    dimensions: [],
    dayTimeline: [
      {
        dayNumber: 3,
        tripDayId: 'day-3',
        status: 'warning' as const,
        summary: '冰川徒步日',
        issueIds: [issue.id],
      },
    ],
    issues: [issue],
    alternatives: [],
    summary: { mustHandle: 0, suggestAdjust: 1, pendingConfirm: 0, blockers: 0 },
    teamFitSummary: { score: 75, memberCount: 12, profilingCompletedCount: 10 },
  };
}

describe('split-plan.projection.util', () => {
  it('projects splitPlan and daySplits from schedule (no template placeholders)', () => {
    const issue = makeFatigueIssue();
    const schedule = makeSchedule();
    const result = projectSplitPlanBundle({
      tripId: 'trip-1',
      report: makeReport(issue),
      constraintsSummary: makeConstraintsSummary(),
      primaryIssue: issue,
      experienceCompletionDelta: 31,
      schedule,
    });

    expect(result).toBeDefined();
    expect(result!.splitPlan.kind).toBe('physical_strength');
    expect(result!.splitPlan.id).toContain('split_d3');
    expect(result!.splitPlan.banner.affectedDays).toEqual([3]);
    expect(result!.splitPlan.groups).toHaveLength(2);

    expect(result!.splitPlan.groups[0].label).toBe('年轻人组（8 人）');
    expect(result!.splitPlan.groups[1].label).toBe('长者组（4 人）');
    expect(result!.splitPlan.groups[0].memberCount).toBe(8);
    expect(result!.splitPlan.groups[1].memberCount).toBe(4);

    expect(result!.splitPlan.groups[0].activityTitle).toBe('高强度体验');
    expect(result!.splitPlan.groups[0].activityTitle).not.toContain('高强度日');
    expect(result!.splitPlan.groups[1].activityTitle).toBe('舒适休息');
    expect(result!.splitPlan.groups[0].highlights).toEqual(
      expect.arrayContaining(['冰川徒步体验 4.5 小时', '专业向导 & 安全保障', '拍摄与探索']),
    );
    expect(result!.splitPlan.groups[1].highlights).toEqual(
      expect.arrayContaining(['咖啡馆时光', '低疲劳 & 轻松安排']),
    );
    expect(result!.splitPlan.groups[0].costPerPerson).toBe('¥880/人');
    expect(result!.splitPlan.groups[1].costPerPerson).toBe('¥220/人');

    expect(result!.splitPlan.logistics.meetupPoint).toBe('Skógafoss 酒店餐厅');
    expect(result!.splitPlan.logistics.meetupPoint).not.toBe('汇合点');

    expect(result!.splitPlan.metrics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: 'experience_satisfaction', displayValue: '+31%' }),
        expect.objectContaining({ key: 'senior_fatigue', displayValue: '-48%' }),
      ]),
    );
    expect(result!.splitPlan.actions.map((a) => a.type)).toEqual([
      'apply_split_plan',
      'view_split_alternatives',
      'discuss_with_nara',
    ]);
    expect(result!.daySplits).toHaveLength(1);
    expect(result!.daySplits[0].splitPlanId).toBe(result!.splitPlan.id);
    expect(result!.daySplits[0].dayIndex).toBe(2);
    expect(result!.daySplits[0].branches).toHaveLength(2);
    expect(result!.daySplits[0].branches[0].groupId).toBe('grp_a');
    expect(result!.daySplits[0].branches[0].members).toEqual([
      { id: 'u1', displayName: 'danli xu' },
      { id: 'u2', displayName: 'Danny' },
    ]);
    expect(result!.splitPlan.groups[0].segments?.[0]).toMatchObject({
      title: '冰川徒步体验',
      placeName: 'Sólheimajökull',
    });
  });

  it('returns undefined without schedule (no orphan splitPlan)', () => {
    const issue = makeFatigueIssue();
    const result = projectSplitPlanBundle({
      tripId: 'trip-1',
      report: makeReport(issue),
      constraintsSummary: makeConstraintsSummary(),
      primaryIssue: issue,
    });
    expect(result).toBeUndefined();
  });

  it('skips projection when split plan already applied', () => {
    const issue = makeFatigueIssue();
    const schedule = makeSchedule();
    const preview = projectSplitPlanBundle({
      tripId: 'trip-1',
      report: makeReport(issue),
      constraintsSummary: makeConstraintsSummary(),
      primaryIssue: issue,
      schedule,
    });
    expect(preview).toBeDefined();

    const bundle = projectSplitPlanBundle({
      tripId: 'trip-1',
      report: makeReport(issue),
      constraintsSummary: makeConstraintsSummary(),
      primaryIssue: issue,
      schedule,
      appliedSplitPlanIds: [preview!.splitPlan.id],
    });

    expect(bundle).toBeUndefined();
  });

  it('appendSplitSnapshotSuffix preserves base version fingerprint', () => {
    const base = 'constraints_v8:plan_v2:conflicts_20260628T101200Z';
    expect(appendSplitSnapshotSuffix(base, 'split_d3_glacier')).toBe(
      `${base}:split_d3_glacier`,
    );
  });

  it('readAppliedSplitPlanIds parses metadata entries', () => {
    const ids = readAppliedSplitPlanIds({
      appliedSplitPlans: [{ id: 'split_d3_a' }, 'split_d4_b'],
    });
    expect(ids).toEqual(['split_d3_a', 'split_d4_b']);
  });
});
