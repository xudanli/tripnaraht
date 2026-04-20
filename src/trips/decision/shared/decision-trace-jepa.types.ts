/**
 * Optional JEPA / Decision Trace attachment for `DecisionLogEntry`.
 *
 * Aligns with OKR 2 (`docs/decision/AI_ENGINEERING_OKRS_LATENT_CONTRACT.md`) and
 * Latent Contract semantics (`docs/decision/LATENT_CONTRACT_FIELD_DICTIONARY.md`).
 * Intentionally lives under `shared/` so decision logging does not depend on `optimization/`.
 *
 * `z_state` keys mirror `LatentContractSnapshot.z_state` in
 * `optimization/scoring/candidate-scorer.interface.ts` — keep in sync when extending.
 */

/** Training / diagnosis taxonomy from chief-ai-scientist.md (prediction error). */
export type PredictionErrorKind = 'WORLD' | 'USER_DRIFT' | 'UTILITY';

/**
 * Normalized decision-state slice (0..1 scalars where applicable).
 * All fields optional: log writers may partial-fill per stage.
 */
export interface ZStateSnapshot {
  continuity?: number;
  risk_score?: number;
  cost?: number;
  fatigue?: number;
  satisfaction_estimate?: number;
}

/** Same-head keys as multi-head simulator output; values are scores or probabilities in product contract. */
export interface ZPredHeadsSnapshot {
  risk_head?: number;
  continuity_head?: number;
  fatigue_head?: number;
  cost_head?: number;
  satisfaction_head?: number;
}

/** Persisted contract id (TD-04 + Prisma `metadata.jepaTrace`). */
export const JEPA_TRACE_CONTRACT_VERSION = 'decision-trace-jepa@v1' as const;

function isRecord(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

/** Minimal trace for a CGUS / plan candidate (OKR 2 baseline). */
export function minimalJepaTraceForCandidate(candidateId: string): JepaDecisionTraceV1 {
  return {
    contractVersion: JEPA_TRACE_CONTRACT_VERSION,
    candidateId,
  };
}

/**
 * Read `jepaTrace` from Prisma `DecisionLog.metadata` (canonical persistence shape).
 */
export function extractJepaTraceFromMetadata(metadata: unknown): JepaDecisionTraceV1 | undefined {
  if (!isRecord(metadata)) return undefined;
  const j = metadata.jepaTrace;
  if (!isRecord(j)) return undefined;
  if (j.contractVersion !== JEPA_TRACE_CONTRACT_VERSION) return undefined;
  return j as unknown as JepaDecisionTraceV1;
}

/**
 * Merge optional `jepaTrace` into metadata for `decision_logs.metadata` JSON.
 * Entry-level `jepaTrace` wins over any stale `metadata.jepaTrace`.
 */
export function mergeMetadataWithJepaTrace(
  base: Record<string, unknown> | null | undefined,
  jepaTrace?: JepaDecisionTraceV1,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...(base || {}) };
  if (jepaTrace) {
    out.jepaTrace = jepaTrace;
  }
  return out;
}

/**
 * v1 attachment. Does not carry Gate verdicts; must not replace `DecisionLogEntry.action`.
 */
export interface JepaDecisionTraceV1 {
  contractVersion: typeof JEPA_TRACE_CONTRACT_VERSION;
  /** Optional: which candidate / plan id this row refers to (CGUS, replan, etc.). */
  candidateId?: string;
  /** State before or after the logged decision step (writer-defined). */
  z_state?: ZStateSnapshot;
  /** Model or simulator output at log time. */
  z_pred?: ZPredHeadsSnapshot;
  /** Observed or inferred outcome (post-trip, telemetry, user feedback proxy). */
  z_real?: ZStateSnapshot;
  /** Simple numeric delta per head when both sides exist (optional materialized view). */
  delta?: Partial<Record<keyof ZStateSnapshot, number>> & Partial<Record<keyof ZPredHeadsSnapshot, number>>;
  predictionErrorKind?: PredictionErrorKind;
  /** Weak labels for rerank / scorer (OKR 2 KR2.3). */
  weakLabels?: {
    presentedRank?: number;
    accepted?: boolean;
    replanned?: boolean;
  };
}
