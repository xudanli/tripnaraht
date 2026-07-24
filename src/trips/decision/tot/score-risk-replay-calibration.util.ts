/**
 * scoreRisk v3：从 decision-closure replay golden 推导 stress 场景（分国家分桶）。
 */
import type { OptimizationHints } from '../../../decision/kernel/decision-state.types';
import type { OptimizationResult } from '../../../itinerary-optimization/interfaces/plan-request.interface';
import type { E2ECase } from '../evaluation/e2e-case.types';
import { loadDecisionClosureGolden } from '../evaluation/decision-closure-assertions';
import type { TripPlan } from '../plan-model';
import type { ActivityCandidate, TripWorldState } from '../world-model';
import type { ScoreRiskCalibrationScenario } from './score-risk-calibration.fixture';

const COUNTRY_LABEL: Record<string, string> = {
  IS: 'Iceland',
  NZ: 'New Zealand',
  AU: 'Australia',
  JP: 'Japan',
};

function inferSlackMin(hints: OptimizationHints): number {
  const rejected = hints.decisionVerdict?.rejected_plans ?? [];
  const infeasibleHard = rejected
    .filter((p) => p.status === 'infeasible')
    .reduce((s, p) => s + (p.hard_violation_count ?? 0), 0);
  if (infeasibleHard >= 2) return 8;
  if (infeasibleHard >= 1) return 12;
  if (rejected.length > 0) return 22;
  return 40;
}

function inferRobustness(hints: OptimizationHints): number {
  const chosen = hints.alternatives?.find((a) => a.id === hints.decisionVerdict?.chosen_plan_id);
  const fp = chosen?.feasibilityProbability;
  if (typeof fp === 'number') return Math.max(0.2, Math.min(0.85, fp));
  const rejected = hints.decisionVerdict?.rejected_plans ?? [];
  if (rejected.some((p) => p.status === 'infeasible')) return 0.35;
  return 0.55;
}

function startDateFromHints(hints: OptimizationHints): string {
  const dates = hints.worldConstraintMaterialization?.weatherDates;
  if (dates?.[0]) return dates[0].slice(0, 10);
  return '2026-03-12';
}

function worldFromClosureFixture(testCase: E2ECase, hints: OptimizationHints): TripWorldState {
  const country = testCase.input.countryCode ?? 'IS';
  const startDate = startDateFromHints(hints);
  const label = COUNTRY_LABEL[country] ?? country;
  const roadIds = hints.worldConstraintMaterialization?.roadIds ?? [];
  const highStress = (hints.decisionVerdict?.rejected_plans ?? []).some((p) => p.status === 'infeasible');

  return {
    context: {
      destination: `${label} closure replay`,
      startDate,
      durationDays: 5,
      preferences: {
        intents: { nature: 0.7, scenic: 0.6 },
        pace: 'moderate',
        riskTolerance: highStress ? 'low' : 'medium',
      },
    },
    candidatesByDate: {
      [startDate]: [
        {
          id: `poi-${testCase.id}`,
          name: { en: `${label} route segment` },
          type: 'sightseeing',
          durationMin: 240,
          riskLevel: highStress ? 'high' : 'medium',
          weatherSensitivity: roadIds.length > 0 ? 3 : 2,
          inventoryRisk: highStress ? 3 : 2,
          requiresBooking: true,
        } satisfies ActivityCandidate,
      ],
    },
    signals: { lastUpdatedAt: `${startDate}T08:00:00.000Z` },
  } as TripWorldState;
}

function planFromClosureFixture(hints: OptimizationHints): TripPlan {
  const startDate = startDateFromHints(hints);
  return {
    days: [{ date: startDate, timeSlots: [{ id: 's1', time: '09:00', poiId: 'poi-replay' }] }],
    metrics: { robustnessScore: inferRobustness(hints) },
  } as TripPlan;
}

function optimizationFromClosureFixture(hints: OptimizationHints): OptimizationResult {
  const slack = inferSlackMin(hints);
  return {
    robustness: {
      top3_min_slack_nodes: [{ slack_min: slack }],
      risk_level: slack < 15 ? 'high' : slack < 25 ? 'medium' : 'low',
      total_buffer_minutes: Math.max(10, slack),
    },
    diagnostics: {
      critical_windows: [{ slack_to_close_min: Math.max(5, slack - 3) }],
    },
  } as OptimizationResult;
}

export function buildScoreRiskScenarioFromClosureFixture(testCase: E2ECase): ScoreRiskCalibrationScenario | undefined {
  const hints = loadDecisionClosureGolden(testCase.metadata ?? {});
  if (!hints?.decisionVerdict?.chosen_plan_id) return undefined;
  const slack = inferSlackMin(hints);
  const maxScore = slack <= 12 ? 0.52 : slack <= 25 ? 0.62 : 0.75;
  return {
    id: `replay-${testCase.id}`,
    description: `Replay golden: ${testCase.name}`,
    world: worldFromClosureFixture(testCase, hints),
    plan: planFromClosureFixture(hints),
    optimizationResult: optimizationFromClosureFixture(hints),
    maxScore,
    minScore: slack >= 40 ? 0.35 : undefined,
  };
}

export function buildScoreRiskReplayClosureScenarios(
  fixtures: readonly E2ECase[],
): ScoreRiskCalibrationScenario[] {
  return fixtures
    .map(buildScoreRiskScenarioFromClosureFixture)
    .filter((s): s is ScoreRiskCalibrationScenario => s !== undefined);
}

export type ScoreRiskReplayBucketSummary = {
  countryCode: string;
  fixtureCount: number;
  avgScore: number;
  maxScore: number;
  minScore: number;
  avgSlackMin: number;
};

export function summarizeReplayScoresByCountry(
  results: Array<{ id: string; score: number; metrics: Record<string, number> }>,
  fixtures: readonly E2ECase[],
): ScoreRiskReplayBucketSummary[] {
  const byCountry = new Map<string, { scores: number[]; slacks: number[] }>();
  for (const r of results) {
    const fixture = fixtures.find((f) => `replay-${f.id}` === r.id);
    const cc = fixture?.input.countryCode ?? 'XX';
    const bucket = byCountry.get(cc) ?? { scores: [], slacks: [] };
    bucket.scores.push(r.score);
    bucket.slacks.push(r.metrics.slackMin ?? 0);
    byCountry.set(cc, bucket);
  }
  return [...byCountry.entries()].map(([countryCode, b]) => ({
    countryCode,
    fixtureCount: b.scores.length,
    avgScore: b.scores.reduce((a, x) => a + x, 0) / b.scores.length,
    maxScore: Math.max(...b.scores),
    minScore: Math.min(...b.scores),
    avgSlackMin: b.slacks.reduce((a, x) => a + x, 0) / b.slacks.length,
  }));
}
