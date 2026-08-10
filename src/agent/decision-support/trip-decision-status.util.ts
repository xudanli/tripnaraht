/**
 * 行程级决策状态读模型（开放题 + 已提交账本）。
 */

import {
  readOpenTravelDecisionProblems,
  readTravelDecisionCommitments,
  type TravelDecisionCommitmentRecord,
} from './persist-travel-decision-commit.util';
import type { TravelDecisionProblem } from './travel-decision.types';

export type TripDecisionStatusV1 = {
  schema_id: 'tripnara.trip_decision_status@v1';
  trip_id: string;
  open_problems: Array<{
    decision_id: string;
    decision_key: string;
    title_zh: string;
    state: string;
    option_count: number;
    recommendation_option_id?: string;
  }>;
  commitments: TravelDecisionCommitmentRecord[];
  latest: Record<string, unknown> | null;
  travel_decision_contract: unknown | null;
};

export function buildTripDecisionStatus(params: {
  tripId: string;
  metadata: unknown;
}): TripDecisionStatusV1 {
  const meta =
    params.metadata && typeof params.metadata === 'object'
      ? (params.metadata as Record<string, unknown>)
      : {};
  const open = readOpenTravelDecisionProblems(meta);
  const commitments = readTravelDecisionCommitments(meta);

  return {
    schema_id: 'tripnara.trip_decision_status@v1',
    trip_id: params.tripId,
    open_problems: open.map((p: TravelDecisionProblem) => ({
      decision_id: p.decisionId,
      decision_key: p.decisionKey,
      title_zh: p.subject.title_zh,
      state: p.state,
      option_count: p.options.length,
      recommendation_option_id: p.recommendation?.optionId,
    })),
    commitments: commitments?.history ?? [],
    latest:
      meta.travelDecisionLatest && typeof meta.travelDecisionLatest === 'object'
        ? (meta.travelDecisionLatest as Record<string, unknown>)
        : null,
    travel_decision_contract: meta.travelDecisionContract ?? null,
  };
}
