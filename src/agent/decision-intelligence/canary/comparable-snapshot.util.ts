/**
 * Comparable Snapshot — Production 与 Candidate 共用同一 WorldState + Evidence。
 * Offline Better ≠ Production Better：离线分不可直接当作生产优越证明。
 */

import type { EvidenceFactV1 } from '../../harness/hardening/evidence.contract';
import type { TravelWorldStateV1 } from '../../state-learning/travel-world-state.types';
import type {
  TravelWorldStateWithQualityV1,
} from '../../state-learning/hardening/world-state-quality.util';
import {
  attachTravelWorldStateQuality,
} from '../../state-learning/hardening/world-state-quality.util';

export const COMPARABLE_DECISION_SNAPSHOT_SCHEMA =
  'nara.comparable_decision_snapshot@v1' as const;

export type ComparableDecisionSnapshotV1 = {
  schemaId: typeof COMPARABLE_DECISION_SNAPSHOT_SCHEMA;
  version: 1;
  snapshotId: string;
  tripId: string;
  decisionKey: string;
  capturedAt: string;
  worldState: TravelWorldStateWithQualityV1;
  evidence: EvidenceFactV1[];
  /** 同一快照供双侧评估 */
  sharedByProductionAndCandidate: true;
  offlineBetterIsNotProductionBetter: true;
};

export function buildComparableDecisionSnapshot(input: {
  tripId: string;
  decisionKey: string;
  worldState: TravelWorldStateV1 | TravelWorldStateWithQualityV1;
  evidence: EvidenceFactV1[];
  snapshotId?: string;
}): ComparableDecisionSnapshotV1 {
  const world =
    'quality' in input.worldState
      ? (input.worldState as TravelWorldStateWithQualityV1)
      : attachTravelWorldStateQuality(input.worldState);

  return {
    schemaId: COMPARABLE_DECISION_SNAPSHOT_SCHEMA,
    version: 1,
    snapshotId: input.snapshotId ?? `snap_${input.tripId}_${Date.now()}`,
    tripId: input.tripId,
    decisionKey: input.decisionKey,
    capturedAt: new Date().toISOString(),
    worldState: world,
    evidence: [...input.evidence],
    sharedByProductionAndCandidate: true,
    offlineBetterIsNotProductionBetter: true,
  };
}
