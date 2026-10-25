/**
 * Phase 4 P1 — Shadow Canary Stage 0 observation.
 * 系统可 100% 跑；用户不可见；记录应提醒次数 / 原因 / 方案质量。
 */

import type { ProactiveDecisionCaseId } from '../contracts/proactive-decision-case.types';
import type { ProactiveOptionId } from '../synthesis/proactive-synthesis.types';

export const PROACTIVE_SHADOW_OBSERVATION_SCHEMA =
  'nara.proactive_shadow_observation@v1' as const;

export const PROACTIVE_SHADOW_LOG_METADATA_KEY =
  'proactiveDecisionV1ShadowLog' as const;

export type ProactiveShadowWouldNotify =
  | 'WOULD_NOTIFY'
  | 'WOULD_SILENT'
  | 'NO_DECISION';

export type ProactiveShadowQualityV1 = {
  /** 0..1 composite for方案质量 */
  score: number;
  hasRecommendedOption: boolean;
  confidenceOk: boolean;
  hardGatePassed: boolean;
  whyExplainOk: boolean;
  cardLayersOk: boolean;
  notesZh: string[];
};

export type ProactiveShadowObservationV1 = {
  schemaId: typeof PROACTIVE_SHADOW_OBSERVATION_SCHEMA;
  version: 1;
  tripId: string;
  signalEventId: string;
  caseId: ProactiveDecisionCaseId | null;
  decisionProblemId: string | null;
  observedAt: string;
  /** Stage 0 always userInvisible */
  userVisible: false;
  canaryStage: 'SHADOW';
  wouldNotify: ProactiveShadowWouldNotify;
  interventionValue: number | null;
  threshold: number | null;
  recommendedOptionId: ProactiveOptionId | null;
  confidence: number | null;
  quality: ProactiveShadowQualityV1;
  /** Compact Decision Trace replay */
  decisionTraceReplay: Record<string, unknown> | null;
  whyExplainZh: string | null;
};

export const PROACTIVE_SHADOW_LOG_SCHEMA =
  'nara.proactive_shadow_log@v1' as const;

export type ProactiveShadowLogV1 = {
  schemaId: typeof PROACTIVE_SHADOW_LOG_SCHEMA;
  version: 1;
  tripId: string;
  updatedAt: string;
  observations: ProactiveShadowObservationV1[];
};

export type ProactiveShadowSummaryV1 = {
  schemaId: 'nara.proactive_shadow_summary@v1';
  version: 1;
  totalRuns: number;
  wouldNotifyCount: number;
  wouldSilentCount: number;
  noDecisionCount: number;
  /** wouldNotify / totalRuns */
  wouldNotifyRate: number | null;
  meanInterventionValueWhenNotify: number | null;
  meanQualityScore: number | null;
  byCase: Partial<
    Record<
      ProactiveDecisionCaseId,
      { runs: number; wouldNotify: number; meanQuality: number | null }
    >
  >;
};
