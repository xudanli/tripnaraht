import type { StabilityDriftSignal, StabilityFixHandlers } from './stability.types';

/**
 * Invokes caller-supplied hooks — **no hidden mutation** of compiler/policy rules.
 * Missing handlers are skipped (stability plane surfaces drift only).
 */
export function applyStabilityFixes(signals: StabilityDriftSignal[], handlers?: StabilityFixHandlers): void {
  if (!handlers || signals.length === 0) {
    return;
  }

  const types = new Set(signals.map(s => s.type));

  if (types.has('CONSTRAINT_DRIFT')) {
    handlers.repairConstraintRules?.();
  }
  if (types.has('IR_DETERMINISM_DRIFT') || types.has('DAG_STRUCTURE_DRIFT')) {
    handlers.recompileIR?.();
    handlers.rebuildDAGIndex?.();
  }
  if (types.has('POLICY_BEHAVIOR_DRIFT')) {
    handlers.resetNeptunePolicyCache?.();
  }
}
