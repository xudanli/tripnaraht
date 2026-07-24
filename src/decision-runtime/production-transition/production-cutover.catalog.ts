/**
 * Production cutover — Canonical Runtime as default; legacy-frozen + Lex Shadow unchanged.
 *
 * Proven: Canonical governance chain is safer (Trigger, finalize, Auth, Executor, fallback).
 * NOT proven: Lex beats legacy-frozen on plan quality — do not flip OPTIMIZATION to Lex.
 */

export const PRODUCTION_CUTOVER_PHASE = 'PRODUCTION_CUTOVER' as const;
export const PRODUCTION_PROBATION_DAYS = 7;

/** Target posture after cutover (maps to repo env vars). */
export const PRODUCTION_CUTOVER_TARGET = {
  DECISION_RUNTIME_PHASE: PRODUCTION_CUTOVER_PHASE,
  /** Runtime governance authority — NOT optimization strategy authority. */
  CURRENT_AUTHORITY: 'CANONICAL',
  CANONICAL_ROLLOUT: 'ON',
  LEX_ROLE: 'SHADOW_ONLY',
  /** legacy-frozen remains plan-selection authority (AUTO → legacy-frozen). */
  OPTIMIZATION_STRATEGY_MODE: 'LEGACY_FROZEN',
  DECISION_RUNTIME_MODE: 'CANONICAL',
  /** Repo name: ON_FOR_SELECTED (= selective constraint gateway). */
  CONSTRAINT_GATEWAY_MODE: 'ON_FOR_SELECTED',
  CONSTRAINT_EVALUATION_GATEWAY_ENABLED: '1',
  DECISION_TRIGGER_GATEWAY_ENABLED: '1',
  DECISION_TRIGGER_LINEAGE_ENABLED: '1',
  AUTHORIZATION_POLICY_GATEWAY_ENABLED: '1',
  REPLANNING_TRIGGER_POLICY_ENABLED: '0',
  EFFECTIVE_PLAN_WRITE_GUARD: '1',
  RFC001_SHADOW_MODE: '0',
  CANONICAL_EXECUTION_ENABLED: '1',
  CANONICAL_FULL_PLAN_SELECTION: '1',
  BOUNDED_LNS_REPAIR_ENABLED: '0',
  LEGACY_CONVERGENCE_TARGET: 'CANONICAL_DEFAULT',
} as const;

/** Hot rollback — config only, no redeploy. */
export const PRODUCTION_CUTOVER_ROLLBACK = {
  CURRENT_AUTHORITY: 'LEGACY',
  CANONICAL_ROLLOUT: 'OFF',
  DECISION_RUNTIME_MODE: 'LEGACY',
  DECISION_RUNTIME_PHASE: 'PRODUCTION_ROLLBACK',
} as const;

export const CUTOVER_ZERO_TOLERANCE_TRIGGERS = [
  'constraint.block-winner',
  'authorization.unauthorized-execute',
  'executor.shadow-effective-write',
  'executor.duplicate-execute',
  'executor.non-executor-effective-write',
  'trigger.bypass-requests',
] as const;

export const CUTOVER_POST_SWITCH_CHECKPOINTS_HOURS = [0.25, 1, 4, 24] as const;

/** 7-day probation pass criteria — not calendar alone. */
export const PROBATION_PASS_CRITERIA = [
  { id: 'trigger-bypass', label: 'Trigger formal bypass', target: '0' },
  { id: 'block-winner', label: 'BLOCK winner', target: '0' },
  { id: 'unauthorized-write', label: 'Unauthorized Effective write', target: '0' },
  { id: 'shadow-write', label: 'Shadow Effective write', target: '0' },
  { id: 'duplicate-execute', label: 'Duplicate execute', target: '0' },
  { id: 'critical-rollback-fail', label: 'Critical rollback failure', target: '0' },
  { id: 'lineage-complete', label: 'Lineage completeness', target: '~100%' },
  { id: 'legacy-fallback', label: 'Legacy hot rollback verified', target: 'available' },
] as const;

export interface ProductionCutoverSmokeScenario {
  id: string;
  label: string;
  probe: string;
}

export const PRODUCTION_CUTOVER_SMOKE_SCENARIOS: ProductionCutoverSmokeScenario[] = [
  {
    id: 'runtime-health',
    label: 'Scenario 0 — runtime health + capabilities posture',
    probe: 'GET /decision-engine/v1/health + runtime-capabilities',
  },
  {
    id: 'feasible-chain',
    label: 'Scenario 1 — feasible plan: Trigger→Snapshot→Constraint→finalize→Auth→Execute',
    probe: 'staging full-plan-selection or guide accept (manual trip)',
  },
  {
    id: 'block-candidate',
    label: 'Scenario 2 — BLOCK candidate must not become winner',
    probe: 'constraint shadow / audit — blockWinner=0',
  },
  {
    id: 'all-infeasible',
    label: 'Scenario 3 — all infeasible → no winner, no execute',
    probe: 'MISSING_WINNER / ALL_INFEASIBLE response',
  },
  {
    id: 'idempotent-execute',
    label: 'Scenario 4 — duplicate idempotencyKey → no second PlanVersion',
    probe: 'execution ledger duplicate=0',
  },
  {
    id: 'auth-deny',
    label: 'Scenario 5 — unauthorized / expired → no execute',
    probe: 'authorization unauthorized=0',
  },
  {
    id: 'shadow-isolation',
    label: 'Scenario 6 — Lex shadow events OK, shadow Effective writes=0',
    probe: 'executor.shadow-effective-write=0',
  },
];
