/**
 * Scalar Lyapunov surrogate V from closure evaluation — decreases toward manifold interior.
 */

import type { EcoNeptuneClosureEvaluation } from '../execution-cognitive-orchestrator/execution-cognitive-orchestrator.types';
import { manifoldViolation } from './evaluate-convergence';

/** V(S): non-negative violation mass outside the closure threshold hyper-rectangle. */
export function computeLyapunovSurrogate(c: EcoNeptuneClosureEvaluation): number {
  return manifoldViolation(c);
}

/** True if V does not increase along the sequence (weak Lyapunov step condition). */
export function isLyapunovNonIncreasing(sequence: EcoNeptuneClosureEvaluation[]): boolean {
  if (sequence.length < 2) return true;
  for (let i = 1; i < sequence.length; i++) {
    const v0 = computeLyapunovSurrogate(sequence[i - 1]!);
    const v1 = computeLyapunovSurrogate(sequence[i]!);
    if (v1 > v0 + 1e-9) return false;
  }
  return true;
}
