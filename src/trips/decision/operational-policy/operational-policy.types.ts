/**
 * P-OPS-3 — Operational policy layer (warn / degrade / block / reroute semantics).
 * Config is versioned JSON; evaluation is pure + auditable on signals.
 */

export const OPS_OPERATIONAL_POLICY_SCHEMA = 'p-ops-3/v1' as const;

/** Discrete governance actions (product maps these to UX / finalize gates). */
export type OpsGovernanceAction =
  | 'ALLOW'
  | 'WARN_ONLY'
  | 'DEGRADED_EXECUTION_SEMANTICS'
  | 'BLOCK_FINALIZE'
  | 'REQUIRE_REROUTE_OR_USER_CONFIRM';

export interface OpsOperationalPolicyConfigV1 {
  version: typeof OPS_OPERATIONAL_POLICY_SCHEMA;
  /** Weather evidence aggregate pipeline (HARD/SOFT from derive-travel-hazards path). */
  weather: {
    onHardViolation: OpsGovernanceAction;
    onSoftViolation: OpsGovernanceAction;
    /**
     * When true with `onHardViolation === BLOCK_FINALIZE`, `generatePlan` may reject the plan
     * after policy evaluation (strict ops — opt-in; default false keeps advisory-only).
     */
    enforceHardBlock?: boolean;
  };
  /** World fact freshness (computeFactFreshness); consumed by resolver / replay jobs. */
  worldFact: {
    /** Above this age (seconds) → at least WARN_ONLY if not already degraded. */
    warnAboveAgeSeconds?: number;
    /** Above this age (seconds) → DEGRADED_EXECUTION_SEMANTICS when wiring consumers. */
    degradedAboveAgeSeconds?: number;
    onExpiredValidTo: OpsGovernanceAction;
  };
  /** Road dependency propagation / structural replan signals (future: wire from ConstraintImpactV0). */
  routing: {
    onStructuralReplanSuggested: OpsGovernanceAction;
  };
}

export interface OpsWeatherGovernanceResolution {
  branch: 'weather';
  action: OpsGovernanceAction;
  reasonCodes: string[];
  detail?: string;
}

export interface OpsWorldFactGovernanceResolution {
  branch: 'world_fact';
  action: OpsGovernanceAction;
  reasonCodes: string[];
  /** Reference age or staleness context */
  ageSeconds?: number;
  expiredByValidTo?: boolean;
}

export interface OpsOperationalGovernanceSnapshot {
  policyVersion: string;
  /** ISO 8601 */
  evaluatedAt: string;
  weather?: OpsWeatherGovernanceResolution;
  worldFact?: OpsWorldFactGovernanceResolution;
}
