/**
 * Build / append Travel Decision Dataset records.
 */

import { randomUUID } from 'crypto';
import type { ProactiveImpactV1 } from '../contracts/proactive-impact.types';
import type { ProactiveSynthesisV1 } from '../synthesis/proactive-synthesis.types';
import type { ProactiveInterventionDecisionV1 } from '../intervention/evaluate-proactive-intervention.util';
import type { ProactiveShadowObservationV1 } from '../shadow/proactive-shadow-observation.types';
import type { ProactiveCanaryStage } from '../config/proactive-canary-config.util';
import {
  PROACTIVE_DECISION_DATASET_LOG_SCHEMA,
  PROACTIVE_DECISION_DATASET_METADATA_KEY,
  PROACTIVE_DECISION_DATASET_RECORD_SCHEMA,
  mapSignalKindToDatasetTrigger,
  type ProactiveDecisionDatasetLogV1,
  type ProactiveDecisionDatasetRecordV1,
  type ProactiveDatasetOutcomeLabel,
  type ProactiveDatasetUserAction,
} from './proactive-decision-dataset.types';

const DEFAULT_RING = 200;

export function buildProactiveDecisionDatasetRecord(input: {
  tripId: string;
  impact: ProactiveImpactV1;
  synthesis: ProactiveSynthesisV1 | null;
  intervention: ProactiveInterventionDecisionV1 | null;
  decisionProblemId?: string | null;
  canaryStage: ProactiveCanaryStage;
  userVisible: boolean;
  wouldNotify?: boolean;
  qualityScore?: number | null;
  userAction?: ProactiveDatasetUserAction;
  outcome?: ProactiveDatasetOutcomeLabel;
  at?: string;
  recordId?: string;
}): ProactiveDecisionDatasetRecordV1 {
  const wouldNotify =
    input.wouldNotify ?? input.intervention?.gate === 'NOTIFY_CARD';

  return {
    schemaId: PROACTIVE_DECISION_DATASET_RECORD_SCHEMA,
    version: 1,
    recordId: input.recordId ?? randomUUID(),
    tripId: input.tripId,
    signalEventId: input.impact.signalEventId,
    decisionProblemId: input.decisionProblemId ?? null,
    caseId: input.impact.caseId,
    at: input.at ?? new Date().toISOString(),
    trigger: mapSignalKindToDatasetTrigger(input.impact.signalKind),
    impact: input.impact.decisionRequired && !!input.impact.caseId,
    recommended: !!input.synthesis?.recommended.optionId,
    userVisible: input.userVisible,
    userAction: input.userAction ?? null,
    outcome: input.outcome ?? 'PENDING',
    signalKind: input.impact.signalKind,
    canaryStage: input.canaryStage,
    wouldNotify,
    interventionValue: input.intervention?.value.interventionValue ?? null,
    confidence: input.synthesis?.confidence ?? null,
    actionability: input.synthesis?.actionability ?? null,
    recommendedOptionId: input.synthesis?.recommended.optionId ?? null,
    qualityScore: input.qualityScore ?? null,
  };
}

export function buildDatasetRecordFromShadow(input: {
  shadow: ProactiveShadowObservationV1;
  impact: ProactiveImpactV1;
  synthesis: ProactiveSynthesisV1 | null;
  intervention: ProactiveInterventionDecisionV1 | null;
}): ProactiveDecisionDatasetRecordV1 {
  return buildProactiveDecisionDatasetRecord({
    tripId: input.shadow.tripId,
    impact: input.impact,
    synthesis: input.synthesis,
    intervention: input.intervention,
    decisionProblemId: input.shadow.decisionProblemId,
    canaryStage: 'SHADOW',
    userVisible: false,
    wouldNotify: input.shadow.wouldNotify === 'WOULD_NOTIFY',
    qualityScore: input.shadow.quality.score,
    outcome:
      input.shadow.wouldNotify === 'WOULD_SILENT' ? 'SILENT_OK' : 'PENDING',
    at: input.shadow.observedAt,
  });
}

export function readProactiveDecisionDatasetLog(
  metadata: unknown,
): ProactiveDecisionDatasetLogV1 | null {
  if (!metadata || typeof metadata !== 'object') return null;
  const raw = (metadata as Record<string, unknown>)[
    PROACTIVE_DECISION_DATASET_METADATA_KEY
  ];
  if (!raw || typeof raw !== 'object') return null;
  const log = raw as ProactiveDecisionDatasetLogV1;
  if (log.schemaId !== PROACTIVE_DECISION_DATASET_LOG_SCHEMA) return null;
  return log;
}

export function appendProactiveDecisionDatasetRecord(
  metadata: unknown,
  record: ProactiveDecisionDatasetRecordV1,
  ringMax = DEFAULT_RING,
): Record<string, unknown> {
  const base =
    metadata && typeof metadata === 'object'
      ? { ...(metadata as Record<string, unknown>) }
      : {};
  const prev = readProactiveDecisionDatasetLog(base);
  const records = [...(prev?.records ?? []), record].slice(-ringMax);
  const log: ProactiveDecisionDatasetLogV1 = {
    schemaId: PROACTIVE_DECISION_DATASET_LOG_SCHEMA,
    version: 1,
    tripId: record.tripId,
    updatedAt: record.at,
    records,
  };
  base[PROACTIVE_DECISION_DATASET_METADATA_KEY] = log;
  return base;
}

/**
 * Patch latest matching record (same signalEventId) with user action / outcome.
 */
export function patchProactiveDecisionDatasetRecord(
  metadata: unknown,
  patch: {
    signalEventId?: string;
    decisionProblemId?: string | null;
    userAction?: ProactiveDatasetUserAction;
    outcome?: ProactiveDatasetOutcomeLabel;
    userVisible?: boolean;
    at?: string;
  },
): Record<string, unknown> {
  const base =
    metadata && typeof metadata === 'object'
      ? { ...(metadata as Record<string, unknown>) }
      : {};
  const prev = readProactiveDecisionDatasetLog(base);
  if (!prev?.records.length) return base;

  const records = [...prev.records];
  let idx = -1;
  for (let i = records.length - 1; i >= 0; i -= 1) {
    const r = records[i];
    if (
      (patch.signalEventId && r.signalEventId === patch.signalEventId) ||
      (patch.decisionProblemId &&
        r.decisionProblemId === patch.decisionProblemId)
    ) {
      idx = i;
      break;
    }
  }
  if (idx < 0) idx = records.length - 1;

  const current = records[idx];
  records[idx] = {
    ...current,
    userAction:
      patch.userAction !== undefined ? patch.userAction : current.userAction,
    outcome: patch.outcome !== undefined ? patch.outcome : current.outcome,
    userVisible:
      patch.userVisible !== undefined ? patch.userVisible : current.userVisible,
    at: patch.at ?? new Date().toISOString(),
  };

  base[PROACTIVE_DECISION_DATASET_METADATA_KEY] = {
    ...prev,
    updatedAt: records[idx].at,
    records,
  };
  return base;
}

/** Compact product JSON row for export / logs */
export function toProactiveDecisionDatasetReplayJson(
  record: ProactiveDecisionDatasetRecordV1,
): Record<string, unknown> {
  return {
    trigger: record.trigger,
    impact: record.impact,
    recommended: record.recommended,
    user_visible: record.userVisible,
    user_action: record.userAction,
    outcome: record.outcome,
    caseId: record.caseId,
    interventionValue: record.interventionValue,
    confidence: record.confidence,
  };
}
