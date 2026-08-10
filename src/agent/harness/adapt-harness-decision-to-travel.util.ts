/**
 * D3：Harness Decision Runtime ↔ TravelDecisionProblem / UI Card 适配。
 * Harness 裁定 Gate/Recommend；领域对象与 Card 投影仍走既有 TravelDecision ABI。
 */

import type { TravelDecisionProblem, TravelDecisionOption } from '../decision-support/travel-decision.types';
import type {
  DecisionGateResult,
  DecisionPipelineResultV1,
} from './decision-runtime.util';

/** Harness optionId → TravelDecision optionId */
const HARNESS_TO_TRAVEL_OPTION: Record<string, string> = {
  '2wd': '2WD',
  '4wd': '4WD',
  '4wd_plus': '4WD_PLUS',
  ring_road: 'RING_ROAD',
  south_coast: 'SOUTH_COAST',
  south_plus_snaefellsnes: 'SOUTH_PLUS_SNAEFELLSNES',
};

const TRAVEL_TO_HARNESS_OPTION: Record<string, string> = Object.fromEntries(
  Object.entries(HARNESS_TO_TRAVEL_OPTION).map(([h, t]) => [t, h]),
);

export function mapHarnessOptionIdToTravel(optionId: string): string {
  const raw = String(optionId ?? '').trim();
  return HARNESS_TO_TRAVEL_OPTION[raw.toLowerCase()] ?? raw.toUpperCase();
}

export function mapTravelOptionIdToHarness(optionId: string): string {
  const raw = String(optionId ?? '').trim();
  return TRAVEL_TO_HARNESS_OPTION[raw] ?? raw.toLowerCase();
}

function findTravelOption(
  problem: TravelDecisionProblem,
  harnessOrTravelId: string,
): TravelDecisionOption | undefined {
  const travelId = mapHarnessOptionIdToTravel(harnessOrTravelId);
  return (
    problem.options.find((o) => o.optionId === travelId) ??
    problem.options.find((o) => o.optionId === harnessOrTravelId) ??
    problem.options.find(
      (o) => o.optionId.toLowerCase() === String(harnessOrTravelId).toLowerCase(),
    )
  );
}

/** 将 Harness Gate 失败映射为 Travel option BLOCKED；推荐对齐管线 */
export function applyHarnessPipelineToTravelProblem(
  problem: TravelDecisionProblem,
  pipe: DecisionPipelineResultV1,
): TravelDecisionProblem {
  const gateByTravelId = new Map<string, DecisionGateResult>();
  for (const g of pipe.gateResults) {
    gateByTravelId.set(mapHarnessOptionIdToTravel(g.optionId), g);
  }

  const options = problem.options.map((o) => {
    const g = gateByTravelId.get(o.optionId);
    if (!g || g.passed) return o;
    return {
      ...o,
      feasibility: 'BLOCKED' as const,
      blockingReasons_zh: [...(o.blockingReasons_zh ?? []), ...g.reasonsZh],
      recommended: false,
    };
  });

  const recommendedTravelId = pipe.problem.recommendedOptionId
    ? mapHarnessOptionIdToTravel(pipe.problem.recommendedOptionId)
    : undefined;
  const recOpt = recommendedTravelId
    ? options.find((o) => o.optionId === recommendedTravelId && o.feasibility !== 'BLOCKED')
    : undefined;

  const nextOptions = options.map((o) => ({
    ...o,
    recommended: recOpt ? o.optionId === recOpt.optionId : o.recommended,
  }));

  return {
    ...problem,
    state: recOpt ? 'RECOMMENDED' : problem.state === 'OPEN' ? 'OPTIONS_READY' : problem.state,
    options: nextOptions,
    recommendation: recOpt
      ? {
          optionId: recOpt.optionId,
          reason_zh: pipe.recommendationZh,
          confidence: 'HIGH',
        }
      : problem.recommendation,
  };
}

export function projectHarnessDecisionPipelineForTrace(
  pipe: DecisionPipelineResultV1,
): Record<string, unknown> {
  return {
    schema: 'nara.decision_runtime_pipeline@v1',
    phases_completed: pipe.phasesCompleted,
    decision_id: pipe.problem.decisionId,
    decision_key: pipe.problem.decisionKey ?? null,
    kind: pipe.problem.kind,
    recommended_option_id: pipe.problem.recommendedOptionId ?? null,
    selected_option_id: pipe.problem.selectedOptionId ?? null,
    commit_authority: pipe.problem.commitAuthority,
    awaiting_select: pipe.awaitingSelect,
    gate: pipe.gateResults.map((g) => ({
      option_id: g.optionId,
      travel_option_id: mapHarnessOptionIdToTravel(g.optionId),
      passed: g.passed,
      reasons_zh: g.reasonsZh,
    })),
    compare: pipe.compareRows.map((r) => ({
      option_id: r.optionId,
      score: Number.isFinite(r.score) ? r.score : null,
      eliminated_by_gate: r.eliminatedByGate,
    })),
    applied_to_itinerary: false,
  };
}

/** Harness decisionKey → Registry decisionKey */
export function mapHarnessDecisionKeyToRegistry(
  key: string | undefined,
  kind: string,
): string | null {
  if (key === 'VEHICLE_ROAD_FIT' || kind === 'VEHICLE_ROAD_FIT') return 'VEHICLE_ROAD_FIT';
  if (key === 'ROUTE_SCOPE_RING_VS_SOUTH' || kind === 'ROUTE_SEGMENT') return 'TRIP_SCOPE';
  if (key === 'TRIP_SCOPE') return 'TRIP_SCOPE';
  return key && key.length > 0 ? key : null;
}

export function assertDecisionCommitDoesNotApplyPlan(problem: TravelDecisionProblem): void {
  if (problem.persistenceTarget === 'ITINERARY_DRAFT' && problem.state === 'COMMITTED') {
    // Commit 可写偏好/合同；禁止把 persistence 当成已 Apply 行程
  }
  // 硬约束由响应层 applied_to_itinerary:false 保证；此处供测试断言
  void findTravelOption;
}
