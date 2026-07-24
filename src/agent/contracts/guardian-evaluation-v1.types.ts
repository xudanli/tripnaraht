/**
 * Structured guardian evaluation contracts (Work Package D).
 * LLM may narrate; formal verdicts MUST use these shapes for Ledger + write authority.
 */

export interface ConstraintViolationV1 {
  code: string;
  severity: 'HARD' | 'SOFT';
  message?: string;
  evidenceRef?: string;
}

export interface ScopeRefV1 {
  kind: 'TRIP' | 'DAY' | 'ITEM' | 'SEGMENT';
  id: string;
}

export interface AbuEvaluationV1 {
  schemaId: 'tripnara.guardian.abu@v1';
  authority: 'SAFETY';
  verdict: 'PASS' | 'WARN' | 'BLOCK';
  violations: ConstraintViolationV1[];
  evidenceRefs: string[];
  affectedScope: ScopeRefV1[];
  overridePolicy: 'NOT_OVERRIDABLE' | 'USER_CONFIRMATION_REQUIRED' | 'OVERRIDABLE';
}

export interface AdjustmentV1 {
  kind: string;
  targetScope: ScopeRefV1;
  rationale?: string;
}

export interface DreEvaluationV1 {
  schemaId: 'tripnara.guardian.dre@v1';
  authority: 'PACE';
  verdict: 'PASS' | 'WARN' | 'OVERLOADED';
  affectedMembers: string[];
  loadMetrics: {
    drivingMinutes: number;
    activityLoad: number;
    recoveryMinutes: number;
    bufferMinutes: number;
  };
  recommendations: AdjustmentV1[];
}

export interface AlternativeCandidateV1 {
  candidateId: string;
  label?: string;
  summary?: string;
}

export interface TradeoffV1 {
  dimension: string;
  left: string;
  right: string;
  note?: string;
}

export interface NeptuneEvaluationV1 {
  schemaId: 'tripnara.guardian.neptune@v1';
  authority: 'ALTERNATIVE_SEARCH';
  candidates: AlternativeCandidateV1[];
  tradeoffs: TradeoffV1[];
  recommendedCandidateId?: string;
}

export type GuardianEvaluationV1 = AbuEvaluationV1 | DreEvaluationV1 | NeptuneEvaluationV1;

export interface PlanEvaluationBundleV1 {
  schemaId: 'tripnara.plan_evaluation@v1';
  abu: AbuEvaluationV1;
  dre: DreEvaluationV1;
  neptune: NeptuneEvaluationV1;
  /** Natural language is projection-only — must not drive writes without structured verdicts above */
  narrationProjection?: string;
}
