/** Global bucket for cross-cutting hard rules stored in `DecisionRuleConfig.actionName`. */
export const HARD_TRUTH_GLOBAL_ACTION = '__global__' as const;

/** Prefix for `DecisionRuleConfig.handlerId` rows that represent hard-truth toggles (not SideEffect handlers). */
export const HARD_TRUTH_HANDLER_PREFIX = 'hard_truth.' as const;

/** v1 keys (extend as you add more hard-truth knobs). */
export const HARD_TRUTH_KEY = {
  GATE_FROAD_BLOCK_2WD: `${HARD_TRUTH_HANDLER_PREFIX}gate.froad.block_2wd`,
} as const;
