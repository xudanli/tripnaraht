import type { FeasibilityIssueDto, FeasibilityProofDto } from '../types/trip-constraint-solver.types';
import type { PlanningConflictItem } from '../types/planning-conflicts.types';
import type { ConstraintsSummaryResponse } from '../types/constraints-summary.types';
import {
  formatCurrencyDelta,
  formatMinuteDelta,
  formatScoreDelta,
  mapProofEvidenceKind,
  mapProofReliability,
  projectDecisionCheckerResponse,
} from './decision-checker-view.projection.util';

function makeConstraintsSummary(): ConstraintsSummaryResponse {
  return {
    tripId: 'trip-1',
    constraintsVersion: 3,
    confirmedAt: null,
    confirmedBy: null,
    isUserConfirmed: false,
    isVersionConfirmed: false,
    allReady: true,
    pendingCount: 0,
    timeRange: { startDate: null, endDate: null, dayCount: 3, status: 'missing' },
    budget: { total: 10000, currency: 'CNY', status: 'confirmed' },
    travelers: { count: 3, memberCount: 3, profilingCompletedCount: 2, status: 'confirmed' },
    transport: { travelMode: 'self_drive', transportHint: null, status: 'confirmed' },
    pendingItems: [],
  };
}

function makeReport(issues: FeasibilityIssueDto[]) {
  return {
    tripId: 'trip-1',
    tripTitle: 'Test',
    verdict: { status: 'ADJUST_REQUIRED' as const, headline: '需调整' },
    overallScore: 72,
    verifiedForTripVersion: 'v2',
    currentTripVersion: 'v2',
    isStale: false,
    canStartExecute: false,
    gateExecute: { blocked: false, reasons: [] },
    dimensions: [],
    dayTimeline: [],
    issues,
    alternatives: [],
    summary: { mustHandle: 1, suggestAdjust: 0, pendingConfirm: 0, blockers: 1 },
    itineraryCompletenessSummary: { score: 88, signalCount: 2 },
  };
}

describe('decision-checker-view.projection.util', () => {
  describe('formatters', () => {
    it('formats minute delta with hours', () => {
      expect(formatMinuteDelta(-100)).toBe('-1h 40m');
      expect(formatMinuteDelta(45)).toBe('+45m');
    });

    it('formats currency delta', () => {
      expect(formatCurrencyDelta(620, 'CNY')).toBe('+¥620');
    });

    it('formats score delta', () => {
      expect(formatScoreDelta(13)).toBe('+13');
      expect(formatScoreDelta(-5)).toBe('-5');
    });
  });

  describe('evidence mapping', () => {
    it('maps OSRM to route_engine with high reliability', () => {
      const proof: FeasibilityProofDto = {
        entity: 'OSRM',
        constraint: 'drive',
        currentFact: '5h 20m',
        evidenceSource: 'OSRM',
        evidenceType: 'route',
        conclusion: '超时',
        confidence: 0.95,
      };
      expect(mapProofEvidenceKind(proof)).toBe('route_engine');
      expect(mapProofReliability(proof)).toBe('high');
    });
  });

  describe('projectDecisionCheckerResponse', () => {
    const issue: FeasibilityIssueDto = {
      id: 'cfl_drive_day2',
      priority: 'must_handle',
      category: 'transport',
      title: '每日驾驶上限',
      message: 'Day 2 连续驾驶时长 5h 20m，超过每日上限 4 小时，超出 1h 20m。',
      affectedDays: [2],
      severity: 'high',
      issueKind: 'daily_drive',
      anchors: { shortfallMinutes: 80, travelMinutes: 320 },
      proofs: [
        {
          entity: '路线引擎',
          constraint: 'max_daily_drive',
          currentFact: '预计驾驶 5h 20m',
          evidenceSource: 'OSRM',
          evidenceType: 'route_engine',
          conclusion: '超出上限',
          observedAt: '2026-06-28T10:07:00Z',
          confidence: 0.95,
        },
      ],
    };

    const planningConflicts: PlanningConflictItem[] = [
      {
        id: 'cfl_drive_day2',
        source: 'feasibility',
        priority: 'must_handle',
        category: 'transport',
        title: issue.title,
        message: issue.message,
        affectedDays: [2],
        issue,
      },
    ];

    it('projects overview metrics with backend-formatted displayValue', () => {
      const result = projectDecisionCheckerResponse({
        tripId: 'trip-1',
        generatedAt: '2026-06-28T10:12:00Z',
        constraintsSummary: makeConstraintsSummary(),
        report: makeReport([issue]),
        planningConflicts,
        primaryIssue: issue,
        repairOptions: {
          blockerId: 'cfl_drive_day2',
          issueId: 'cfl_drive_day2',
          options: [
            {
              id: 'change_day2_lodging',
              title: '更换 Day 2 住宿',
              description: '缩短当日行驶距离',
              impact: 'high',
              cost: 620,
            },
          ],
        },
        assessScoreDelta: 13,
        experienceCompletionDelta: -12,
      });

      expect(result.schema).toBe('tripnara.decision_checker@v1');
      expect(result.overview.conflict.hardCount).toBe(1);
      expect(result.overview.aiSuggestion?.text).toContain('硬冲突');
      expect(result.overview.repairPlan?.metrics).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ key: 'feasibility', displayValue: '+13' }),
          expect.objectContaining({ key: 'drive_duration', displayValue: '-1h 20m' }),
          expect.objectContaining({ key: 'budget', displayValue: '+¥620' }),
        ]),
      );
      expect(result.evidence.items.length).toBeGreaterThan(0);
      expect(result.evidence.items[0].reliability).toBe('high');
      expect(result.evidence.judgmentExplanation).toContain('超过每日上限');
      expect(result.impact.constraints[0]).toMatchObject({
        constraintId: 'c_max_daily_drive',
        name: '每日驾驶上限 ≤ 4 小时',
        status: '超出 1h 20m',
      });
      expect(result.impact.aiInterpretation?.text).toContain('Day 2');
      expect(result.impact.summary.budgetImpact?.value).toBe('+¥620');
      expect(result.impact.summary.experienceCompletion?.value).toBe('-12%');
      expect(result.counterfactual.scenarios[0].letter).toBe('A');
      expect(result.counterfactual.ifUnchanged?.recommendation?.source).toBe('rule');
      expect(result.snapshotVersion).toContain('constraints_v3');
      expect(result.evidence.calculationDetailUrl).toContain('repair-options');
      expect(result.counterfactual.subheadline).toContain('种调整路径');
      expect(result.impact.cascade.length).toBeGreaterThan(0);
      expect(result.overview.repairPlan?.cta?.type).toBe('open_repair_plan');
    });

    it('omits aiSuggestion when no hard conflicts', () => {
      const softIssue: FeasibilityIssueDto = {
        ...issue,
        id: 'soft-1',
        priority: 'suggest_adjust',
        severity: 'medium',
      };
      const result = projectDecisionCheckerResponse({
        tripId: 'trip-1',
        generatedAt: '2026-06-28T10:12:00Z',
        constraintsSummary: makeConstraintsSummary(),
        report: makeReport([softIssue]),
        planningConflicts: [
          {
            id: 'soft-1',
            source: 'feasibility',
            priority: 'suggest_adjust',
            category: 'transport',
            title: softIssue.title,
            message: softIssue.message,
            issue: softIssue,
          },
        ],
        primaryIssue: softIssue,
      });

      expect(result.overview.conflict.hardCount).toBe(0);
      expect(result.overview.aiSuggestion).toBeUndefined();
      expect(result.evidence.items.length).toBeGreaterThan(0);
    });

    it('projects repairPlan from synthesized daily_drive options without repairOptions input', () => {
      const issue = dailyDriveIssue();
      const result = projectDecisionCheckerResponse({
        tripId: 'trip-1',
        generatedAt: '2026-06-28T10:12:00Z',
        constraintsSummary: makeConstraintsSummary(),
        report: makeReport([issue]),
        planningConflicts: [
          {
            id: issue.id,
            source: 'feasibility',
            priority: 'must_handle',
            category: 'transport',
            title: issue.title,
            message: issue.message,
            affectedDays: [2],
            issue,
          },
        ],
        primaryIssue: issue,
      });

      expect(result.overview.repairPlan).toBeDefined();
      expect(result.overview.repairPlan?.metrics.some((m) => m.key === 'drive_duration')).toBe(true);
      expect(result.counterfactual.scenarios.length).toBeGreaterThan(0);
    });
  });
});

function dailyDriveIssue(): import('../types/trip-constraint-solver.types').FeasibilityIssueDto {
  return {
    id: 'conflict-daily-drive-day-2',
    priority: 'must_handle',
    category: 'transport',
    title: '每日驾驶上限',
    message: 'Day 2 连续驾驶时长 5h 20m，超过每日上限 4 小时，超出 1h 20m。',
    affectedDays: [2],
    severity: 'high',
    issueKind: 'daily_drive',
    anchors: { shortfallMinutes: 80, travelMinutes: 320 },
    proofs: [
      {
        entity: '路线引擎',
        constraint: 'max_daily_drive',
        currentFact: '预计驾驶 5h 20m',
        evidenceSource: 'OSRM',
        evidenceType: 'route_engine',
        conclusion: '超出上限',
        observedAt: '2026-06-28T10:07:00Z',
        confidence: 0.95,
      },
    ],
  };
}
