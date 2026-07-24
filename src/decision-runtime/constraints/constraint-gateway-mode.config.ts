/**
 * Constraint Gateway rollout modes — OFF → SHADOW_COMPARE → ON.
 * @see DECISION_RUNTIME_MATURITY.md §8 P3
 */

export type ConstraintGatewayMode = 'OFF' | 'SHADOW_COMPARE' | 'ON_FOR_SELECTED' | 'ON';

export function resolveConstraintGatewayMode(): ConstraintGatewayMode {
  const modeRaw = process.env.CONSTRAINT_GATEWAY_MODE?.trim().toUpperCase();
  if (
    modeRaw === 'OFF' ||
    modeRaw === 'SHADOW_COMPARE' ||
    modeRaw === 'ON_FOR_SELECTED' ||
    modeRaw === 'ON'
  ) {
    return modeRaw;
  }

  const legacyFlag = process.env.CONSTRAINT_EVALUATION_GATEWAY_ENABLED?.trim().toLowerCase();
  if (legacyFlag === '1' || legacyFlag === 'true' || legacyFlag === 'yes') {
    return 'ON';
  }

  return 'OFF';
}

/** Gateway runs (evaluate + providers). True for SHADOW_COMPARE, ON_FOR_SELECTED, and ON. */
export function isConstraintEvaluationGatewayEnabled(): boolean {
  const mode = resolveConstraintGatewayMode();
  return mode === 'ON' || mode === 'SHADOW_COMPARE' || mode === 'ON_FOR_SELECTED';
}

/** Canonical report is authority for feasible / formal filtering. */
export function isConstraintGatewayAuthorityMode(): boolean {
  return resolveConstraintGatewayMode() === 'ON';
}

/** Selected scenarios use canonical authority; others stay legacy + shadow metrics. */
export function isConstraintGatewayOnForSelectedMode(): boolean {
  return resolveConstraintGatewayMode() === 'ON_FOR_SELECTED';
}

/** Dual-run: legacy boolean remains authority; canonical logged for divergence metrics. */
export function isConstraintGatewayShadowCompareMode(): boolean {
  return resolveConstraintGatewayMode() === 'SHADOW_COMPARE';
}

/** Legacy + canonical dual-run (full shadow or per-scenario in ON_FOR_SELECTED). */
export function isConstraintGatewayDualRunEligible(): boolean {
  const mode = resolveConstraintGatewayMode();
  return mode === 'SHADOW_COMPARE' || mode === 'ON_FOR_SELECTED';
}
