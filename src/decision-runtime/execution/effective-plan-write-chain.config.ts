/**
 * Phase 5 — Effective Plan 写链收口开关
 */

export function isEffectivePlanWriteChainEnabled(): boolean {
  const v = process.env.EFFECTIVE_PLAN_WRITE_CHAIN?.trim().toLowerCase();
  if (v === '0' || v === 'false' || v === 'no') return false;
  if (v === '1' || v === 'true' || v === 'yes') return true;
  return process.env.NODE_ENV === 'production';
}

/** Repair / readiness 直写须走 authorize → execute（或 unified apply） */
export function isPlanRepairDraftOnlyEnabled(): boolean {
  return isEffectivePlanWriteChainEnabled();
}

/** Agent / Planner 时间轴物化仅产出 TripMutationSet 草稿，不直写 ItineraryItem */
export function isAgentPlanDraftOnlyEnabled(): boolean {
  return isEffectivePlanWriteChainEnabled();
}
