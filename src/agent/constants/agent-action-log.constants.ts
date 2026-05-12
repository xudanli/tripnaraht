/** AgentActionLog.status — commit saga ledger (first-class audit + recovery hooks) */
export const AGENT_ACTION_LOG_STATUS = {
  INIT: 'INIT',
  /** action.execute() succeeded; side effects may still be pending */
  COMMITTED: 'COMMITTED',
  /** SideEffectRegistry.applyMany finished (or no side effects configured) */
  SIDE_EFFECT_DONE: 'SIDE_EFFECT_DONE',
  FAILED: 'FAILED',
  /** Reconciliation worker started cleanup; awaiting async provider confirmation */
  CLEANING_IN_PROGRESS: 'CLEANING_IN_PROGRESS',
  /** Async cleanup exceeded limits; requires human ops */
  MANUAL_INTERVENTION_REQUIRED: 'MANUAL_INTERVENTION_REQUIRED',
  /** Reconciliation worker confirmed compensations / cleanup completed */
  CLEANED: 'CLEANED',
} as const;

export type AgentActionLogStatus = (typeof AGENT_ACTION_LOG_STATUS)[keyof typeof AGENT_ACTION_LOG_STATUS];
