/**
 * Decision-centric Memory Explanation（Phase 1 Audit 合同）。
 *
 * 优先：GET /decision/{id}/memory-explanation
 * 其次：GET /memory/user/{id}/why
 *
 * 用户真正关心：为什么这个建议出现？
 */

import type { ExplainableEvidenceRefV1 } from '../types/memory-explainability.types';

export type DecisionMemoryUsedItemV1 = {
  key: string;
  value: unknown;
  source:
    | 'TRIP_CONSTRAINT'
    | 'EXPLICIT_USER'
    | 'ACTIVE_PROFILE'
    | 'EPISODE'
    | 'WORLD_STATE';
  confidence: number;
  evidence: ExplainableEvidenceRefV1[];
};

export type DecisionMemoryIgnoredItemV1 = {
  key: string;
  value: unknown;
  reason: string;
  /** 如 Trip override / Authority Hierarchy */
  authorityReason?: string;
};

export type DecisionMemoryExplanationV1 = {
  schemaId: 'tripnara.decision_memory_explanation@v1';
  version: 1;
  decisionId: string;
  decisionQuestion: string;
  memoryUsed: DecisionMemoryUsedItemV1[];
  memoryIgnored: DecisionMemoryIgnoredItemV1[];
  designPrinciple: string;
};

/** HTTP 合同（尚未挂路由；Phase 1 落地） */
export const DECISION_MEMORY_EXPLANATION_ROUTES = {
  byDecision: 'GET /decision/{id}/memory-explanation',
  byUserWhy: 'GET /memory/user/{id}/why',
  contextExplain: 'GET /memory/context/explain',
} as const;
