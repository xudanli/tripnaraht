/**
 * Phase 5 / Agent Harness P0-1 W0 — Effective Plan 写链收口开关。
 *
 * Default is ON in all environments (not only production).
 * Explicit EFFECTIVE_PLAN_WRITE_CHAIN=0|false|no disables (tests / ALLOW_WRITE_CHAIN_OFF only).
 */

export function isEffectivePlanWriteChainEnabled(): boolean {
  const v = process.env.EFFECTIVE_PLAN_WRITE_CHAIN?.trim().toLowerCase();
  if (v === '0' || v === 'false' || v === 'no') return false;
  if (v === '1' || v === 'true' || v === 'yes') return true;
  // P0-1 W0: unset → enabled (was: production-only).
  return true;
}

/** Repair / readiness 直写须走 authorize → execute（或 unified apply） */
export function isPlanRepairDraftOnlyEnabled(): boolean {
  return isEffectivePlanWriteChainEnabled();
}

/** Agent / Planner 时间轴物化仅产出 TripMutationSet 草稿，不直写 ItineraryItem */
export function isAgentPlanDraftOnlyEnabled(): boolean {
  return isEffectivePlanWriteChainEnabled();
}
