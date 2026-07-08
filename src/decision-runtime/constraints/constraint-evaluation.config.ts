/**
 * Constraint evaluation feature flags.
 */

export {
  type ConstraintGatewayMode,
  isConstraintEvaluationGatewayEnabled,
  isConstraintGatewayAuthorityMode,
  isConstraintGatewayDualRunEligible,
  isConstraintGatewayOnForSelectedMode,
  isConstraintGatewayShadowCompareMode,
  resolveConstraintGatewayMode,
} from './constraint-gateway-mode.config';
export {
  isConstraintGatewayPlanVerifyProjectionEnabled,
  isConstraintCandidateFacadeEnabled,
  isConstraintAgentBlockDelegated,
} from './constraint-plan-verify.config';

export type DecisionRuntimeMode =
  | 'LEGACY'
  | 'SHADOW'
  | 'DUAL_RUN'
  | 'CANARY'
  | 'CANONICAL';

/**
 * CANARY env is deprecated for dual-run — maps to DUAL_RUN until real CP-SAT canary.
 * True CANARY (CP-SAT authority + stable bucket) requires OR-Tools sign-off.
 */
export function normalizeDecisionRuntimeMode(
  raw: DecisionRuntimeMode,
): 'LEGACY' | 'SHADOW' | 'DUAL_RUN' | 'CANONICAL' {
  if (raw === 'CANARY') return 'DUAL_RUN';
  return raw;
}

export function resolveDecisionRuntimeMode(): DecisionRuntimeMode {
  const raw = process.env.DECISION_RUNTIME_MODE?.trim().toUpperCase();
  if (
    raw === 'LEGACY' ||
    raw === 'SHADOW' ||
    raw === 'DUAL_RUN' ||
    raw === 'CANARY' ||
    raw === 'CANONICAL'
  ) {
    return raw as DecisionRuntimeMode;
  }
  if (process.env.DECISION_GATEWAY_UNIFIED === '1') {
    return process.env.RFC001_SHADOW_MODE === '1' ? 'SHADOW' : 'CANONICAL';
  }
  return 'LEGACY';
}

export function resolveEffectiveRuntimeMode():
  | 'LEGACY'
  | 'SHADOW'
  | 'DUAL_RUN'
  | 'CANONICAL' {
  return normalizeDecisionRuntimeMode(resolveDecisionRuntimeMode());
}

export function isCanonicalExecutionEnabled(): boolean {
  const v = process.env.CANONICAL_EXECUTION_ENABLED;
  if (v === '0' || v === 'false') return false;
  const mode = resolveEffectiveRuntimeMode();
  return mode === 'CANONICAL';
}

/** P1: full itinerary candidates → DecisionCore.finalize (not execute) */
export function isCanonicalFullPlanSelectionEnabled(): boolean {
  const v = process.env.CANONICAL_FULL_PLAN_SELECTION;
  return v === '1' || v === 'true' || v === 'yes';
}

/** Guide variants → DecisionCore.finalize (defaults to CANONICAL_FULL_PLAN_SELECTION) */
export function isGuideCanonicalPlanSelectionEnabled(): boolean {
  const raw = process.env.GUIDE_CANONICAL_PLAN_SELECTION?.trim().toLowerCase();
  if (raw === '0' || raw === 'false' || raw === 'no') return false;
  if (raw === '1' || raw === 'true' || raw === 'yes') return true;
  return isCanonicalFullPlanSelectionEnabled();
}

/** Guide accept → authorize → execute (defaults to guide finalize + canonical execution) */
export function isGuideCanonicalAcceptExecuteEnabled(): boolean {
  const raw = process.env.GUIDE_CANONICAL_ACCEPT_EXECUTE?.trim().toLowerCase();
  if (raw === '0' || raw === 'false' || raw === 'no') return false;
  if (raw === '1' || raw === 'true' || raw === 'yes') return true;
  return isGuideCanonicalPlanSelectionEnabled() && isCanonicalExecutionEnabled();
}

export type OptimizationStrategyMode =
  | 'AUTO'
  | 'LEGACY'
  | 'WEIGHTED'
  | 'CPSAT_LEX'
  | 'CPSAT_EPSILON';

const STRATEGY_MODE_MAP: Record<string, OptimizationStrategyMode> = {
  AUTO: 'AUTO',
  LEGACY: 'LEGACY',
  LEGACY_FROZEN: 'LEGACY',
  WEIGHTED: 'WEIGHTED',
  WEIGHTED_SCORE: 'WEIGHTED',
  CPSAT_LEX: 'CPSAT_LEX',
  CPSAT_LEXICOGRAPHIC: 'CPSAT_LEX',
  CPSAT_EPSILON: 'CPSAT_EPSILON',
};

/** Solver strategy selection — production default AUTO → legacy-frozen until lab sign-off */
export function resolveOptimizationStrategyMode(): OptimizationStrategyMode {
  const raw = process.env.OPTIMIZATION_STRATEGY_MODE?.trim().toUpperCase();
  if (raw && STRATEGY_MODE_MAP[raw]) {
    return STRATEGY_MODE_MAP[raw];
  }
  return 'AUTO';
}

export function isDecisionLabEnabled(): boolean {
  const v = process.env.DECISION_LAB_ENABLED?.trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes';
}

/** Canonical optimization path is authoritative for plan selection (not execute). */
export function isCanonicalPlanSelectionAuthority(): boolean {
  return resolveEffectiveRuntimeMode() === 'CANONICAL';
}

/** Run parallel CP-SAT shadow for comparison — never authoritative until OR-Tools sign-off. */
export function shouldRunFullPlanOptimizationShadow(): boolean {
  const mode = resolveEffectiveRuntimeMode();
  return mode === 'SHADOW' || mode === 'DUAL_RUN';
}
