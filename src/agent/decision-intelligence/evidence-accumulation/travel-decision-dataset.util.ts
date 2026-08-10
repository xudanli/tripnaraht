/**
 * Travel Decision Dataset — WorldState + Evidence + Decision + Recommendation + Choice + Action + Outcome + Evaluation。
 * 用于真实 Canary 数据积累；完成后才进入 Temporal & Proactive Decision。
 */

import type { EvidenceFactV1 } from '../../harness/hardening/evidence.contract';
import type { TravelWorldStateV1 } from '../../state-learning/travel-world-state.types';
import type { CanaryCandidateEvaluationV1 } from '../canary/canary-candidate-evaluation.util';
import type { DecisionRegretV1 } from '../canary/decision-regret.util';

export const TRAVEL_DECISION_DATASET_SCHEMA =
  'nara.travel_decision_dataset@v1' as const;

export type TravelDecisionDatasetRecordV1 = {
  schemaId: typeof TRAVEL_DECISION_DATASET_SCHEMA;
  version: 1;
  recordId: string;
  tripId: string;
  decisionKey: string;
  snapshotId: string;
  worldState: TravelWorldStateV1;
  evidence: EvidenceFactV1[];
  decision: {
    decisionId?: string;
    state?: string;
  };
  recommendation: {
    productionOptionId: string;
    candidateOptionId?: string | null;
  };
  choice: {
    userChosenOptionId?: string | null;
  };
  action: {
    actionId?: string | null;
    appliedToItinerary?: boolean;
  };
  outcome: {
    observable: boolean;
    valueZh?: string | null;
  };
  evaluation?: CanaryCandidateEvaluationV1 | null;
  regret?: DecisionRegretV1 | null;
  recordedAt: string;
};

export type TravelDecisionDatasetV1 = {
  schemaId: typeof TRAVEL_DECISION_DATASET_SCHEMA;
  version: 1;
  datasetId: string;
  records: TravelDecisionDatasetRecordV1[];
  /** 积累未完成前不得进入 Proactive Agent */
  readyForTemporalProactive: boolean;
  minRecordsForTemporal: number;
};

export function createTravelDecisionDataset(input?: {
  datasetId?: string;
  minRecordsForTemporal?: number;
}): TravelDecisionDatasetV1 {
  return {
    schemaId: TRAVEL_DECISION_DATASET_SCHEMA,
    version: 1,
    datasetId: input?.datasetId ?? `tds_${Date.now()}`,
    records: [],
    readyForTemporalProactive: false,
    minRecordsForTemporal: input?.minRecordsForTemporal ?? 50,
  };
}

export function appendTravelDecisionRecord(
  dataset: TravelDecisionDatasetV1,
  record: Omit<TravelDecisionDatasetRecordV1, 'schemaId' | 'version' | 'recordedAt'> & {
    recordedAt?: string;
  },
): TravelDecisionDatasetV1 {
  const next: TravelDecisionDatasetRecordV1 = {
    schemaId: TRAVEL_DECISION_DATASET_SCHEMA,
    version: 1,
    recordedAt: record.recordedAt ?? new Date().toISOString(),
    ...record,
  };
  const records = [...dataset.records, next];
  return {
    ...dataset,
    records,
    readyForTemporalProactive: records.length >= dataset.minRecordsForTemporal,
  };
}

export function projectTravelDecisionDatasetForObservability(
  d: TravelDecisionDatasetV1,
): Record<string, unknown> {
  return {
    schema_id: d.schemaId,
    dataset_id: d.datasetId,
    record_count: d.records.length,
    ready_for_temporal_proactive: d.readyForTemporalProactive,
    min_records_for_temporal: d.minRecordsForTemporal,
  };
}
