/**
 * Build + persist helpers for Shadow Canary observations.
 */

import type { ProactiveImpactV1 } from '../contracts/proactive-impact.types';
import type { ProactiveSynthesisV1 } from '../synthesis/proactive-synthesis.types';
import type { ProactiveInterventionDecisionV1 } from '../intervention/evaluate-proactive-intervention.util';
import type { ProactiveDecisionTraceV1 } from '../trace/proactive-decision-trace.types';
import type { ProactiveReminderCardV1 } from '../surface/proactive-reminder-card.types';
import { toProactiveDecisionTraceReplayJson } from '../trace/build-proactive-decision-trace.util';
import { isProactiveDecisionV1Enabled } from '../config/proactive-decision-feature-flags.util';
import { resolveProactiveCanaryConfig } from '../config/proactive-canary-config.util';
import {
  PROACTIVE_SHADOW_LOG_METADATA_KEY,
  PROACTIVE_SHADOW_LOG_SCHEMA,
  PROACTIVE_SHADOW_OBSERVATION_SCHEMA,
  type ProactiveShadowLogV1,
  type ProactiveShadowObservationV1,
  type ProactiveShadowQualityV1,
  type ProactiveShadowWouldNotify,
} from './proactive-shadow-observation.types';

const DEFAULT_SHADOW_RING = 50;

/**
 * Stage 0：PD V1 开启即记录 Shadow（可 100% 跑），与 L1/L2 audience 无关。
 */
export function shouldRecordProactiveShadow(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  if (!isProactiveDecisionV1Enabled(env)) return false;
  const raw = env.PROACTIVE_SHADOW_RECORD_ENABLED?.trim().toLowerCase();
  if (raw === '0' || raw === 'false' || raw === 'no') return false;
  // Default ON whenever PD V1 on
  return true;
}

export function computeProactiveShadowQuality(input: {
  synthesis: ProactiveSynthesisV1 | null;
  intervention: ProactiveInterventionDecisionV1 | null;
  decisionTrace: ProactiveDecisionTraceV1 | null;
  card: ProactiveReminderCardV1 | null;
}): ProactiveShadowQualityV1 {
  const notesZh: string[] = [];
  const hasRecommendedOption = !!input.synthesis?.recommended.optionId;
  const confidenceOk = (input.synthesis?.confidence ?? 0) >= 0.5;
  const hardGatePassed = input.synthesis?.hardGate.passed !== false;
  const whyExplainOk = (input.decisionTrace?.whyExplainZh.length ?? 0) > 8;
  const cardLayersOk =
    input.card == null
      ? input.intervention?.gate !== 'NOTIFY_CARD'
      : !!(
          input.card.layer1WhatHappenedZh &&
          input.card.layer2WhatImpactedZh &&
          input.card.layer3SuggestionZh &&
          input.card.ctas.length >= 2
        );

  if (!hasRecommendedOption) notesZh.push('缺少推荐选项');
  if (!confidenceOk) notesZh.push('Confidence 偏低');
  if (!hardGatePassed) notesZh.push('Hard Gate 未通过');
  if (!whyExplainOk) notesZh.push('缺少可解释 why');
  if (!cardLayersOk) notesZh.push('卡片层级不完整');

  const flags = [
    hasRecommendedOption,
    confidenceOk,
    hardGatePassed,
    whyExplainOk,
    cardLayersOk,
  ];
  const score = flags.filter(Boolean).length / flags.length;

  return {
    score,
    hasRecommendedOption,
    confidenceOk,
    hardGatePassed,
    whyExplainOk,
    cardLayersOk,
    notesZh,
  };
}

export function resolveShadowWouldNotify(input: {
  impact: ProactiveImpactV1 | null;
  intervention: ProactiveInterventionDecisionV1 | null;
}): ProactiveShadowWouldNotify {
  if (!input.impact?.decisionRequired || !input.impact.caseId) {
    return 'NO_DECISION';
  }
  if (input.intervention?.gate === 'NOTIFY_CARD') return 'WOULD_NOTIFY';
  if (input.intervention?.gate === 'SILENT_LEARNING') return 'WOULD_SILENT';
  return 'NO_DECISION';
}

export function buildProactiveShadowObservation(input: {
  tripId: string;
  impact: ProactiveImpactV1;
  synthesis: ProactiveSynthesisV1 | null;
  intervention: ProactiveInterventionDecisionV1 | null;
  decisionTrace: ProactiveDecisionTraceV1 | null;
  decisionProblemId?: string | null;
  observedAt?: string;
}): ProactiveShadowObservationV1 {
  const card = input.intervention?.card ?? null;
  const quality = computeProactiveShadowQuality({
    synthesis: input.synthesis,
    intervention: input.intervention,
    decisionTrace: input.decisionTrace,
    card,
  });

  return {
    schemaId: PROACTIVE_SHADOW_OBSERVATION_SCHEMA,
    version: 1,
    tripId: input.tripId,
    signalEventId: input.impact.signalEventId,
    caseId: input.impact.caseId,
    decisionProblemId: input.decisionProblemId ?? null,
    observedAt: input.observedAt ?? new Date().toISOString(),
    userVisible: false,
    canaryStage: 'SHADOW',
    wouldNotify: resolveShadowWouldNotify({
      impact: input.impact,
      intervention: input.intervention,
    }),
    interventionValue: input.intervention?.value.interventionValue ?? null,
    threshold: input.intervention?.value.threshold ?? null,
    recommendedOptionId: input.synthesis?.recommended.optionId ?? null,
    confidence: input.synthesis?.confidence ?? null,
    quality,
    decisionTraceReplay: input.decisionTrace
      ? toProactiveDecisionTraceReplayJson(input.decisionTrace)
      : null,
    whyExplainZh: input.decisionTrace?.whyExplainZh ?? null,
  };
}

export function readProactiveShadowLog(
  metadata: unknown,
): ProactiveShadowLogV1 | null {
  if (!metadata || typeof metadata !== 'object') return null;
  const raw = (metadata as Record<string, unknown>)[
    PROACTIVE_SHADOW_LOG_METADATA_KEY
  ];
  if (!raw || typeof raw !== 'object') return null;
  const log = raw as ProactiveShadowLogV1;
  if (log.schemaId !== PROACTIVE_SHADOW_LOG_SCHEMA) return null;
  return log;
}

export function appendProactiveShadowObservationToMetadata(
  metadata: unknown,
  observation: ProactiveShadowObservationV1,
  ringMax = DEFAULT_SHADOW_RING,
): Record<string, unknown> {
  const baseObj =
    metadata && typeof metadata === 'object'
      ? { ...(metadata as Record<string, unknown>) }
      : {};

  const prev = readProactiveShadowLog(baseObj);
  const observations = [...(prev?.observations ?? []), observation].slice(
    -ringMax,
  );

  const log: ProactiveShadowLogV1 = {
    schemaId: PROACTIVE_SHADOW_LOG_SCHEMA,
    version: 1,
    tripId: observation.tripId,
    updatedAt: observation.observedAt,
    observations,
  };
  baseObj[PROACTIVE_SHADOW_LOG_METADATA_KEY] = log;
  return baseObj;
}

/** Assert Stage 0 never elevates userVisible regardless of canary stage env */
export function assertShadowObservationUserInvisible(
  observation: ProactiveShadowObservationV1,
  env: NodeJS.ProcessEnv = process.env,
): void {
  const stage = resolveProactiveCanaryConfig(env).stage;
  if (observation.userVisible) {
    throw new Error('Shadow observation must keep userVisible=false');
  }
  if (observation.canaryStage !== 'SHADOW' && stage === 'SHADOW') {
    throw new Error('Observation stage must be SHADOW while canary is SHADOW');
  }
}
