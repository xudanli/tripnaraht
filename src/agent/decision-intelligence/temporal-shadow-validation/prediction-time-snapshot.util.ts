/**
 * Prediction-time WorldState / Evidence Snapshot。
 * 原则：Future Evidence ≠ Past Prediction Evidence。
 * 禁止用预测时刻之后的 Evidence 回填过去预测。
 */

import type { EvidenceFactV1 } from '../../harness/hardening/evidence.contract';
import type { TravelWorldStateV1 } from '../../state-learning/travel-world-state.types';
import type {
  TravelWorldStateWithQualityV1,
} from '../../state-learning/hardening/world-state-quality.util';
import { attachTravelWorldStateQuality } from '../../state-learning/hardening/world-state-quality.util';
import type { TemporalScenarioId } from '../pilot/scenario-temporal-readiness.util';

export const PREDICTION_TIME_SNAPSHOT_SCHEMA =
  'nara.prediction_time_snapshot@v1' as const;

export type PredictionTimeSnapshotV1 = {
  schemaId: typeof PREDICTION_TIME_SNAPSHOT_SCHEMA;
  version: 1;
  snapshotId: string;
  scenarioId: TemporalScenarioId;
  tripId: string;
  /** 预测冻结时刻（ISO） */
  projectedAt: string;
  worldState: TravelWorldStateWithQualityV1;
  evidence: EvidenceFactV1[];
  /** 显式原则标记 */
  futureEvidenceIsNotPastPredictionEvidence: true;
  frozen: true;
};

export function freezePredictionTimeSnapshot(input: {
  scenarioId: TemporalScenarioId;
  tripId: string;
  projectedAt: string;
  worldState: TravelWorldStateV1 | TravelWorldStateWithQualityV1;
  evidence: EvidenceFactV1[];
  snapshotId?: string;
}): PredictionTimeSnapshotV1 {
  const projectedMs = Date.parse(input.projectedAt);
  if (Number.isNaN(projectedMs)) {
    throw new Error('[PredictionTimeSnapshot] invalid_projectedAt');
  }

  for (const e of input.evidence) {
    if (e.observedAt) {
      const obsMs = Date.parse(e.observedAt);
      if (!Number.isNaN(obsMs) && obsMs > projectedMs) {
        throw new Error(
          '[PredictionTimeSnapshot] future_evidence_forbidden_at_freeze:' +
            `${e.key};Future Evidence ≠ Past Prediction Evidence`,
        );
      }
    }
  }

  const world =
    'quality' in input.worldState
      ? (input.worldState as TravelWorldStateWithQualityV1)
      : attachTravelWorldStateQuality(input.worldState);

  return {
    schemaId: PREDICTION_TIME_SNAPSHOT_SCHEMA,
    version: 1,
    snapshotId:
      input.snapshotId ??
      `pts_${input.scenarioId}_${input.tripId}_${projectedMs}`,
    scenarioId: input.scenarioId,
    tripId: input.tripId,
    projectedAt: input.projectedAt,
    worldState: world,
    evidence: input.evidence.map((e) => ({ ...e })),
    futureEvidenceIsNotPastPredictionEvidence: true,
    frozen: true,
  };
}

export type FutureEvidenceGuardResult =
  | { ok: true }
  | {
      ok: false;
      code: 'FUTURE_EVIDENCE_BACKFILL_FORBIDDEN';
      reasonZh: string;
      offendingKeys: string[];
    };

/**
 * 禁止把 projectedAt 之后才出现的 Evidence 并入预测快照或用于重算过去预测。
 */
export function assertNoFutureEvidenceBackfill(input: {
  snapshot: PredictionTimeSnapshotV1;
  candidateEvidence: EvidenceFactV1[];
}): FutureEvidenceGuardResult {
  const projectedMs = Date.parse(input.snapshot.projectedAt);
  const offending: string[] = [];
  for (const e of input.candidateEvidence) {
    if (!e.observedAt) continue;
    const obsMs = Date.parse(e.observedAt);
    if (!Number.isNaN(obsMs) && obsMs > projectedMs) {
      offending.push(e.key);
    }
  }
  if (offending.length === 0) return { ok: true };
  return {
    ok: false,
    code: 'FUTURE_EVIDENCE_BACKFILL_FORBIDDEN',
    reasonZh:
      'Future Evidence ≠ Past Prediction Evidence：禁止用未来 Evidence 回填过去预测',
    offendingKeys: offending,
  };
}

export function assertNoFutureEvidenceBackfillOrThrow(
  input: Parameters<typeof assertNoFutureEvidenceBackfill>[0],
): void {
  const r = assertNoFutureEvidenceBackfill(input);
  if (r.ok === false) {
    throw new Error(
      `[PredictionTimeSnapshot] ${r.code}:${r.offendingKeys.join(',')}`,
    );
  }
}
