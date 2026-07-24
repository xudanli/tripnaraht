import type { TripFeasibilityReportDto } from '../../trips/trip-constraint-solver/types/trip-constraint-solver.types';
import type { PlanState } from '../../skills/plan/shared/plan-state.types';

export interface PlanGateFeasibilitySnapshot {
  executability: number;
  source: 'feasibility_report' | 'plan_state_estimate';
  verifiedAt?: string;
  verdictStatus?: string;
  canStartExecute?: boolean;
  memberCount?: number;
  completenessScore?: number;
}

export function extractFeasibilitySnapshot(
  report: TripFeasibilityReportDto,
): PlanGateFeasibilitySnapshot {
  return {
    executability: Math.round(report.overallScore),
    source: 'feasibility_report',
    verifiedAt: report.verifiedAt,
    verdictStatus: report.verdict.status,
    canStartExecute: report.canStartExecute,
    memberCount: report.teamFitSummary?.memberCount,
    completenessScore: report.itineraryCompletenessSummary?.score,
  };
}

/** 草案尚未写入时间轴时，用 gate + 节奏 + 报告维度估算可执行性 */
export function estimateDraftExecutability(
  planState: PlanState,
  report?: TripFeasibilityReportDto,
): number {
  const stored = planState.metadata?.executabilityScore as number | undefined;
  if (typeof stored === 'number' && Number.isFinite(stored)) {
    return Math.round(stored);
  }

  let score = report?.overallScore ?? 72;

  switch (planState.gate?.status) {
    case 'ALLOW':
      score = Math.max(score, 85);
      break;
    case 'NEED_CONFIRM':
      score = Math.min(score, 82);
      break;
    case 'SUGGEST_REPLACE':
      score = Math.min(score, 70);
      break;
    case 'REJECT':
      score = Math.min(score, 45);
      break;
    default:
      break;
  }

  const pace = planState.pace.fatigueScore?.paceScore;
  if (typeof pace === 'number') {
    if (pace >= 90) score -= 12;
    else if (pace >= 75) score -= 6;
    else if (pace <= 45) score += 4;
  }

  if (planState.budget.overrun?.overrunAmount) {
    score -= 4;
  }

  const infeasible = planState.mobility.transferSegments.filter(
    (s) => s.feasibility === 'infeasible',
  ).length;
  score -= infeasible * 8;

  return Math.max(0, Math.min(100, Math.round(score)));
}

export function buildExecutabilityDelta(input: {
  baseline?: number;
  draft?: number;
}): { from?: number; to?: number } | undefined {
  if (input.baseline == null && input.draft == null) return undefined;
  return { from: input.baseline, to: input.draft };
}
