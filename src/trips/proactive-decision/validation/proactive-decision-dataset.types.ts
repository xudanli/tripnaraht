/**
 * Phase 5 — Travel Decision Dataset record (Decision Outcome 原料).
 * 每一次主动决策一条；Shadow 亦写。禁止用触发次数当成功指标。
 */

import type { ProactiveDecisionCaseId } from '../contracts/proactive-decision-case.types';
import type { ProactiveWorldSignalKind } from '../contracts/proactive-impact.types';
import type { ProactiveOptionId } from '../synthesis/proactive-synthesis.types';
import type { ProactiveCanaryStage } from '../config/proactive-canary-config.util';

export const PROACTIVE_DECISION_DATASET_RECORD_SCHEMA =
  'nara.proactive_decision_dataset_record@v1' as const;

export const PROACTIVE_DECISION_DATASET_METADATA_KEY =
  'proactiveDecisionV1Dataset' as const;

export type ProactiveDatasetTriggerLabel =
  | 'weather_change'
  | 'road_change'
  | 'activity_window'
  | 'other';

export type ProactiveDatasetUserAction =
  | 'VIEW_OPTIONS'
  | 'DEFER'
  | 'WHY'
  | 'CONFIRM'
  | 'APPLY'
  | 'FEEDBACK_USEFUL'
  | 'FEEDBACK_NOT_USEFUL'
  | null;

export type ProactiveDatasetOutcomeLabel =
  | 'PENDING'
  | 'ACCEPTED'
  | 'DEFERRED'
  | 'USEFUL'
  | 'NOT_USEFUL'
  | 'REGRET_REPORTED'
  | 'SILENT_OK'
  | 'SILENT_MISS'
  | null;

/**
 * Product-facing Decision Dataset row (Phase 5).
 * Aligns with Phase 4 freeze example + validation fields.
 */
export type ProactiveDecisionDatasetRecordV1 = {
  schemaId: typeof PROACTIVE_DECISION_DATASET_RECORD_SCHEMA;
  version: 1;
  recordId: string;
  tripId: string;
  signalEventId: string;
  decisionProblemId: string | null;
  caseId: ProactiveDecisionCaseId | null;
  at: string;

  /** Compact product fields */
  trigger: ProactiveDatasetTriggerLabel;
  impact: boolean;
  recommended: boolean;
  userVisible: boolean;
  userAction: ProactiveDatasetUserAction;
  outcome: ProactiveDatasetOutcomeLabel;

  /** Enrichment for metrics */
  signalKind: ProactiveWorldSignalKind | null;
  canaryStage: ProactiveCanaryStage;
  wouldNotify: boolean;
  interventionValue: number | null;
  confidence: number | null;
  actionability: number | null;
  recommendedOptionId: ProactiveOptionId | null;
  qualityScore: number | null;
};

export const PROACTIVE_DECISION_DATASET_LOG_SCHEMA =
  'nara.proactive_decision_dataset_log@v1' as const;

export type ProactiveDecisionDatasetLogV1 = {
  schemaId: typeof PROACTIVE_DECISION_DATASET_LOG_SCHEMA;
  version: 1;
  tripId: string;
  updatedAt: string;
  records: ProactiveDecisionDatasetRecordV1[];
};

export function mapSignalKindToDatasetTrigger(
  kind: ProactiveWorldSignalKind | null | undefined,
): ProactiveDatasetTriggerLabel {
  if (!kind) return 'other';
  if (kind.startsWith('WEATHER_')) {
    if (kind === 'WEATHER_BLIZZARD') return 'activity_window';
    return 'weather_change';
  }
  if (
    kind === 'ROAD_CLOSURE' ||
    kind === 'ROAD_DIFFICULTY_CHANGE' ||
    kind === 'ROUTE_AVAILABILITY_CHANGE'
  ) {
    return 'road_change';
  }
  return 'other';
}
