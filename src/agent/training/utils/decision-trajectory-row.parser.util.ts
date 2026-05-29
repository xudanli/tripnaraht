import {
  DECISION_TRAJECTORY_SCHEMA_ID,
  type DecisionTrajectoryV1,
} from '../interfaces/decision-trajectory.types';
import type { DecisionTrajectoryETLRow } from '../interfaces/decision-trajectory-etl.types';
import type { OrchestrationOutcomeKind } from '../interfaces/decision-trajectory.types';

export function parseDecisionTrajectoryPayload(raw: unknown): DecisionTrajectoryV1 | null {
  if (!raw || typeof raw !== 'object') return null;
  const p = raw as DecisionTrajectoryV1;
  if (p.schema_id !== DECISION_TRAJECTORY_SCHEMA_ID || !p.request_id) return null;
  return p;
}

export function prismaRowToDecisionTrajectoryETL(row: {
  id: string;
  requestId: string;
  tripId: string | null;
  status: string;
  totalReward: number | null;
  orchestrationOutcome: string | null;
  rewardSignals: unknown;
  payload: unknown;
  createdAt: Date;
  updatedAt: Date;
}): DecisionTrajectoryETLRow | null {
  const payload = parseDecisionTrajectoryPayload(row.payload);
  if (!payload) return null;
  return {
    id: row.id,
    requestId: row.requestId,
    tripId: row.tripId,
    status: row.status,
    totalReward: row.totalReward,
    orchestrationOutcome: (row.orchestrationOutcome as OrchestrationOutcomeKind | null) ?? null,
    rewardSignals: Array.isArray(row.rewardSignals) ? row.rewardSignals : [],
    payload,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
