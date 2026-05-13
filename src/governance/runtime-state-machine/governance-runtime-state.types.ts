/**
 * Governance Runtime State Machine (GRSM) — explicit lifecycle (v1).
 * All runtime posture changes should go through `applyGovernanceRuntimeTransition`.
 */

export type GovernanceRuntimeState =
  | 'NORMAL'
  | 'RESTRICTED'
  | 'BLOCKED'
  | 'REPLANNING'
  | 'RECOVERING'
  | 'HALTED';
