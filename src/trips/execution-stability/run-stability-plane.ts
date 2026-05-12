import { applyStabilityFixes } from './apply-stability-fixes';
import { detectStabilityDrifts, type DetectStabilityDriftsInput } from './detect-stability-drifts';
import { evaluateStability } from './evaluate-stability';
import type { RunStabilityPlaneResult, StabilityFixHandlers } from './stability.types';

/** Global gate from P14 spec — below this, optional stabilization hooks run. */
export const STABILITY_GLOBAL_THRESHOLD = 0.85;

export interface RunExecutionStabilityCycleInput {
  detection: DetectStabilityDriftsInput;
  fixHandlers?: StabilityFixHandlers;
  /** Override threshold (tests). */
  threshold?: number;
}

export function runExecutionStabilityCycle(
  input: RunExecutionStabilityCycleInput,
): RunStabilityPlaneResult {
  const signals = detectStabilityDrifts(input.detection);
  const score = evaluateStability(signals);
  const threshold = input.threshold ?? STABILITY_GLOBAL_THRESHOLD;
  let fixesApplied = false;

  if (score.global < threshold && input.fixHandlers) {
    applyStabilityFixes(signals, input.fixHandlers);
    fixesApplied = true;
  }

  return { signals, score, fixesApplied };
}
