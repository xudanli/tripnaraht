/**
 * P0 — Frozen PlanVersion store name.
 *
 * EffectivePlanVersionStore is the only approved PlanVersion persistence surface.
 * Implementation: Rfc001PlanVersionStoreService.
 * Storage: Trip.metadata and/or rfc001_plan_versions (P2_RFC001_TABLE_STORAGE).
 */

export { Rfc001PlanVersionStoreService as EffectivePlanVersionStore } from '../../trips/guardian-decision-core/plan-version/plan-version.store';
export type {
  StoredRfc001PlanVersions as EffectivePlanVersionBlock,
  StoredRfc001PlanSnapshots as EffectivePlanVersionSnapshots,
  StoredRfc001PlanExecutions as EffectivePlanVersionExecutions,
} from '../../trips/guardian-decision-core/plan-version/plan-version.store';

/** DI token alias for documentation / future swap to first-class table. */
export const EFFECTIVE_PLAN_VERSION_STORE = Symbol('EFFECTIVE_PLAN_VERSION_STORE');
