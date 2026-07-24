/**
 * Formal Production Transition phase markers (SSOT).
 * Engineering complete → PRODUCTION_OBSERVATION; not ENGINEERING_IN_PROGRESS.
 */

export const PRODUCTION_TRANSITION_PHASE_MARKERS = {
  DECISION_RUNTIME_PHASE: 'PRODUCTION_OBSERVATION',
  CURRENT_AUTHORITY: 'LEGACY',
  CANONICAL_ROLLOUT: 'SELECTIVE',
  LEX_ROLE: 'SHADOW_ONLY',
} as const;

export const PRODUCTION_CUTOVER_PHASE_MARKERS = {
  DECISION_RUNTIME_PHASE: 'PRODUCTION_CUTOVER',
  CURRENT_AUTHORITY: 'CANONICAL',
  CANONICAL_ROLLOUT: 'ON',
  LEX_ROLE: 'SHADOW_ONLY',
} as const;

export type DecisionRuntimePhase =
  | (typeof PRODUCTION_TRANSITION_PHASE_MARKERS)['DECISION_RUNTIME_PHASE']
  | (typeof PRODUCTION_CUTOVER_PHASE_MARKERS)['DECISION_RUNTIME_PHASE']
  | 'PRODUCTION_ROLLBACK';
export type CurrentAuthority =
  | (typeof PRODUCTION_TRANSITION_PHASE_MARKERS)['CURRENT_AUTHORITY']
  | (typeof PRODUCTION_CUTOVER_PHASE_MARKERS)['CURRENT_AUTHORITY'];
export type CanonicalRollout =
  | (typeof PRODUCTION_TRANSITION_PHASE_MARKERS)['CANONICAL_ROLLOUT']
  | (typeof PRODUCTION_CUTOVER_PHASE_MARKERS)['CANONICAL_ROLLOUT']
  | 'OFF';
export type LexRole = (typeof PRODUCTION_TRANSITION_PHASE_MARKERS)['LEX_ROLE'];

export interface ProductionTransitionPhaseSnapshot {
  schemaId: 'tripnara.production_transition_phase@v1';
  decisionRuntimePhase: DecisionRuntimePhase;
  currentAuthority: CurrentAuthority;
  canonicalRollout: CanonicalRollout;
  lexRole: LexRole;
  engineeringComplete: true;
  /** Canonical Runtime governance chain is production default (not Lex optimization authority). */
  canonicalProductionAuthority: boolean;
  legacyDeprecated: false;
  optimizationAuthority: 'legacy-frozen';
}

export function resolveProductionTransitionPhase(): ProductionTransitionPhaseSnapshot {
  const authority =
    (process.env.CURRENT_AUTHORITY as CurrentAuthority | undefined) ??
    PRODUCTION_TRANSITION_PHASE_MARKERS.CURRENT_AUTHORITY;

  return {
    schemaId: 'tripnara.production_transition_phase@v1',
    decisionRuntimePhase:
      (process.env.DECISION_RUNTIME_PHASE as DecisionRuntimePhase | undefined) ??
      PRODUCTION_TRANSITION_PHASE_MARKERS.DECISION_RUNTIME_PHASE,
    currentAuthority: authority,
    canonicalRollout:
      (process.env.CANONICAL_ROLLOUT as CanonicalRollout | undefined) ??
      PRODUCTION_TRANSITION_PHASE_MARKERS.CANONICAL_ROLLOUT,
    lexRole:
      (process.env.LEX_ROLE as LexRole | undefined) ??
      PRODUCTION_TRANSITION_PHASE_MARKERS.LEX_ROLE,
    engineeringComplete: true,
    canonicalProductionAuthority: authority === 'CANONICAL',
    legacyDeprecated: false,
    optimizationAuthority: 'legacy-frozen',
  };
}
