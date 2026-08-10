/**
 * P1 — PlanVersion semantic taxonomy (naming; storage modes via P2).
 *
 * Do not treat these as interchangeable IDs in APIs or caches.
 */

export type PlanVersionSemanticKind =
  /** Effective Plan pointer (formal write chain); P2 tables or Trip.metadata */
  | 'RFC001_EFFECTIVE_PLAN_VERSION'
  /** Agent PlanningPlan.planVersion (int) — workbench session draft revision */
  | 'PLANNING_PLAN_SESSION_REVISION'
  /** Agent OrchestratorState.plan_version (int) — replen / trip-run lineage */
  | 'AGENT_ORCHESTRATOR_REVISION'
  /** Mobile derived stamp max(constraintsVersion, spatialPlanVersion) */
  | 'MOBILE_CACHE_STAMP'
  /** Iceland Applied PlanVersion (pv_* audit; not RFC-001 metadata) */
  | 'ICELAND_APPLIED_PLAN_VERSION';

export interface PlanVersionSemanticDescriptor {
  kind: PlanVersionSemanticKind;
  idType: 'string' | 'int';
  storage: string;
  authoritativeFor: string;
  notes: string;
}

export const PLAN_VERSION_SEMANTICS: readonly PlanVersionSemanticDescriptor[] = [
  {
    kind: 'RFC001_EFFECTIVE_PLAN_VERSION',
    idType: 'string',
    storage:
      'rfc001_plan_versions + rfc001_trip_effective_plan (P2) / Trip.metadata.rfc001PlanVersions (compat)',
    authoritativeFor: 'Effective Plan pointer + optional itinerary materialize',
    notes:
      'Only setEffective under EffectivePlanWriteGuard + EffectivePlanWriter; mode via P2_RFC001_TABLE_STORAGE',
  },
  {
    kind: 'PLANNING_PLAN_SESSION_REVISION',
    idType: 'int',
    storage: 'planning_plans.plan_version',
    authoritativeFor: 'Planning Workbench session draft',
    notes: 'Not interchangeable with RFC-001 planVersionId',
  },
  {
    kind: 'AGENT_ORCHESTRATOR_REVISION',
    idType: 'int',
    storage: 'OrchestratorState / TripRun metadata',
    authoritativeFor: 'Agent replen lineage',
    notes: 'Agent-local counter; not Effective Plan',
  },
  {
    kind: 'MOBILE_CACHE_STAMP',
    idType: 'int',
    storage: 'Derived at read time (mobile-planning)',
    authoritativeFor: 'Client If-Match / cache invalidation only',
    notes: 'Prefer exposing constraintsVersion + spatialPlanVersion separately',
  },
  {
    kind: 'ICELAND_APPLIED_PLAN_VERSION',
    idType: 'string',
    storage: 'IcelandAppliedPlanRepository + Trip.metadata.initialPlan',
    authoritativeFor: 'Iceland Initial Plan Apply audit',
    notes: 'Formal via EffectivePlanWriter; distinct from RFC-001 PlanVersion records',
  },
] as const;

/** Canonical API field name for Effective Plan versions. */
export const EFFECTIVE_PLAN_VERSION_ID_FIELD = 'effectivePlanVersionId' as const;

/** Forbidden: naming a mobile/agent int stamp "planVersionId" in formal APIs. */
export const FORBIDDEN_PLAN_VERSION_FIELD_COLLISIONS = [
  'Using planVersion (int) as RFC-001 effectivePlanVersionId',
  'Using Iceland pv_* as Trip.metadata.rfc001PlanVersions item without migration',
] as const;
