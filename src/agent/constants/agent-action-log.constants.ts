/** AgentActionLog.status — commit saga ledger (first-class audit + recovery hooks) */
export const AGENT_ACTION_LOG_STATUS = {
  INIT: 'INIT',
  /** action.execute() succeeded; side effects may still be pending */
  COMMITTED: 'COMMITTED',
  /** SideEffectRegistry.applyMany finished (or no side effects configured) */
  SIDE_EFFECT_DONE: 'SIDE_EFFECT_DONE',
  FAILED: 'FAILED',
} as const;

export type AgentActionLogStatus = (typeof AGENT_ACTION_LOG_STATUS)[keyof typeof AGENT_ACTION_LOG_STATUS];
