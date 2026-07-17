/**
 * Stable product BFF read model — frontend must not depend on Trace internals.
 * Schema: tripnara.causal_decision_product@v1
 */

import type { CausalDecisionCardView } from '../projectors/causal-decision-card.projector';
import type { DecisionOutcome } from '../types/decision-outcome.types';
import type { TravelCausalDecision } from '../types/travel-causal-decision.types';

export const CAUSAL_DECISION_PRODUCT_SCHEMA = 'tripnara.causal_decision_product@v1' as const;

export type CausalDecisionLifecycleStatus =
  | 'OPEN'
  | 'SELECTED'
  | 'APPLIED'
  | 'AWAITING_OBSERVATION'
  | 'RECONCILED'
  | 'STALE';

export interface CausalDecisionProductView {
  schema: typeof CAUSAL_DECISION_PRODUCT_SCHEMA;
  decisionId: string;
  tripId: string;
  problemId: string;

  /** Single-root headline for the card top */
  headline: string;
  /** "最晚需要在 … 前决定" */
  actByLabel?: string;
  interventionDeadline?: string;

  card: CausalDecisionCardView;
  decision: TravelCausalDecision;

  lifecycleStatus: CausalDecisionLifecycleStatus;
  outcome?: DecisionOutcome;

  /**
   * Post-apply copy — never "预测已验证" before observation.
   * e.g. "方案已应用，等待实际到达或签到结果"
   */
  statusMessage?: string;

  contextHash: string;
  ruleVersion: string;
  modelVersion: string;
  worldStateVersion?: string;
  canonicalTraceId?: string;
  ledgerRef?: string;

  generatedAt: string;
}

export interface CausalDecisionListView {
  schema: 'tripnara.causal_decision_list@v1';
  tripId: string;
  generatedAt: string;
  items: CausalDecisionProductView[];
}

export interface CausalDecisionOutcomeView {
  schema: 'tripnara.causal_decision_outcome@v1';
  decisionId: string;
  tripId: string;
  problemId: string;
  lifecycleStatus: CausalDecisionLifecycleStatus;
  outcome?: DecisionOutcome;
  statusMessage?: string;
  generatedAt: string;
}

export interface SelectCausalDecisionRequest {
  optionId: string;
  idempotencyKey?: string;
  reason?: string;
}

export interface ApplyCausalDecisionRequest {
  /** Optional — defaults to previously selected option */
  optionId?: string;
}
