/**
 * unified-explainability@v1 — 所有解释出口的公共超集（Phase 1 SSOT）。
 */

import type {
  DecisionAction,
  DecisionPersona,
  DecisionSource,
  DecisionStage,
} from '../shared/decision-result.types';
import type { DecisionClosureExplainProjection } from '../evaluation/decision-closure-assertions';

export const UNIFIED_EXPLAINABILITY_CONTRACT_VERSION = 'unified-explainability@v1' as const;

export type UnifiedExplainabilityContractVersion = typeof UNIFIED_EXPLAINABILITY_CONTRACT_VERSION;

export type GroundedFactorKind = 'PHYSICAL' | 'UTILITY' | 'PHILOSOPHY' | 'HUMAN' | 'HEURISTIC';

export type GroundedFactorSeverity = 'INFO' | 'WARN' | 'BLOCK';

export interface UnifiedDecisionTraceEntryV1 {
  log_index: number;
  persona: DecisionPersona;
  action: DecisionAction;
  decision_source: DecisionSource;
  decision_stage: DecisionStage;
  reason_codes: string[];
  evidence_refs: string[];
  explanation: string;
}

export interface UnifiedGroundedFactorV1 {
  factor_id: string;
  kind: GroundedFactorKind;
  severity: GroundedFactorSeverity;
  anchor_log_indices: number[];
  anchor_evidence_refs: string[];
  numeric_facts?: Record<string, number>;
  rejection_reason?: string;
}

export interface UnifiedNarrativeSectionV1 {
  persona?: DecisionPersona;
  headline: string;
  body: string;
  /** L3 叙事必须引用 grounded_factors；deterministic 空数组表示纯 log 摘要 */
  anchored_factor_ids: string[];
}

export interface UnifiedNarrativeV1 {
  locale: 'zh' | 'en';
  mode: 'deterministic' | 'llm_polished';
  sections: UnifiedNarrativeSectionV1[];
}

export interface UnifiedExplainabilityIntegrityV1 {
  traceability_valid: boolean;
  physical_evidence_complete: boolean;
  narrative_anchored: boolean;
  drift_violations: string[];
}

export interface UnifiedExplainabilityEnvelopeV1 {
  contract_version: UnifiedExplainabilityContractVersion;
  request_id: string;
  trace_id: string;
  generated_at: string;
  decision_trace: UnifiedDecisionTraceEntryV1[];
  grounded_factors: UnifiedGroundedFactorV1[];
  narrative?: UnifiedNarrativeV1;
  optimization_projection?: DecisionClosureExplainProjection;
  integrity: UnifiedExplainabilityIntegrityV1;
}

export interface BuildUnifiedExplainabilityEnvelopeInput {
  requestId: string;
  traceId?: string;
  decisionLogs?: DecisionLogEntryLike[];
  optimizationHints?: import('../../../decision/kernel/decision-state.types').OptimizationHints;
  timeDrifts?: import('../temporal/time-drift.types').TimeDrift[];
  narrative?: UnifiedNarrativeV1;
  generatedAt?: string;
  /** 覆盖 env；默认 `getPhysicalEvidenceGateMode()` */
  physicalEvidenceGate?: import('../contracts/physical-evidence-gate.util').PhysicalEvidenceGateMode;
}

/** 构建 envelope 所需的最小 log 形状（与 trips DecisionLogEntry 对齐）。 */
export type DecisionLogEntryLike = {
  persona: DecisionPersona;
  action: DecisionAction;
  explanation: string;
  reasonCodes: string[];
  timestamp: string;
  decisionSource: DecisionSource;
  decisionStage: DecisionStage;
  evidenceRefs?: string[];
};
