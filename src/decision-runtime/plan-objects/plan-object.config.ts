/**
 * Phase 4 — PlanObject 投影 feature flag
 */

export function isPlanObjectProjectionEnabled(): boolean {
  const v = process.env.PLAN_OBJECT_PROJECTION_ENABLED?.trim().toLowerCase();
  if (v === '0' || v === 'false' || v === 'no') return false;
  return v === '1' || v === 'true' || v === 'yes';
}

/** Phase 4 — PlanObject assessments feed Gateway PLAN_VERIFY when projection + plan-verify are on */
export function isPlanObjectGatewayEvaluationEnabled(): boolean {
  const v = process.env.PLAN_OBJECT_GATEWAY_EVALUATION?.trim().toLowerCase();
  if (v === '0' || v === 'false' || v === 'no') return false;
  if (v === '1' || v === 'true' || v === 'yes') return true;
  return (
    isPlanObjectProjectionEnabled() &&
    (process.env.CONSTRAINT_GATEWAY_PLAN_VERIFY_PROJECTION?.trim().toLowerCase() === '1' ||
      process.env.CONSTRAINT_GATEWAY_PLAN_VERIFY_PROJECTION?.trim().toLowerCase() === 'true')
  );
}
