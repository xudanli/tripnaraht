/** Recorded on `governance_branch_outcome` ledger rows for replay / diff / graph. */
export type GovernanceBranchRuntimeOutcome =
  | 'replanning_runtime_entered'
  | 'replanning_deferred_plan_gen'
  | 'confirmation_requested'
  | 'execution_suppressed'
  | 'normal_branch_ack'
  /** RCC terminal outcome — GRSM transition already applied by `completeGovernanceRecoveryTransition`. */
  | 'governance_recovery_completed';
