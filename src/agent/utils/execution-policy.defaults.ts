import type { ExecutionPolicyIR } from '../contracts/execution-policy-ir.types';

/** Baseline IR aligned with legacy `decideExecution` v1 constants (pre-PCK shifts). */
export const EXECUTION_POLICY_IR_VERSION = 'ecps-ir/v1';

export function createBaselineExecutionPolicyIR(nowMs: number = Date.now()): ExecutionPolicyIR {
  return {
    version: EXECUTION_POLICY_IR_VERSION,
    compiledAt: nowMs,
    rules: [],
    thresholds: {
      replayConfidenceHigh: 0.82,
      replayConfidenceLow: 0.35,
      anomalyTolerance: 1,
    },
    toolDepthMapping: {
      INVALID_RECOMPUTE: 'HIGH',
      HIGH_VALIDATE_FALLBACK: 'LOW',
      MEDIUM_VALIDATE: 'LOW',
      LOW_WITH_ERRORS: 'HIGH',
      LOW_NO_ERRORS: 'LOW',
      DEFAULT_RECOMPUTE: 'HIGH',
    },
    mediumReuseShortcutEnabled: false,
  };
}
