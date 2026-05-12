/**
 * P-ECO-Closure-7 — Time-varying Lyapunov surrogate V_t(S, Φ): energy definition couples to proof semantics + retention.
 */

import type { LyapunovState } from '../execution-stability/lyapunov.types';
import type { ProbabilisticStabilityCertificate } from '../execution-probabilistic-dynamics';

export interface AdaptiveLyapunov {
  /** Named surrogate family + fingerprint of Φ (policy bundle). */
  energyFunction: string;
  adaptationHistory: Array<{ stepIndex: number; note: string }>;
  /** [0,1] — retained stability mass under evolving rules (Lyapunov region + P6 tail mass). */
  stabilityRetentionScore: number;
}

function clamp01(x: number): number {
  return Math.min(1, Math.max(0, x));
}

export function evaluateAdaptiveLyapunov(input: {
  lyapunov: LyapunovState;
  probabilisticStability?: ProbabilisticStabilityCertificate;
  proofSemanticsFingerprint: string;
  iterationKind: 'single_pass' | 'two_pass';
}): AdaptiveLyapunov {
  const tail = input.probabilisticStability?.probabilityBelowEpsilon ?? 0;
  const retention = clamp01(
    (input.lyapunov.stableRegion ? 0.42 : 0) + tail * 0.58,
  );
  const step = input.iterationKind === 'two_pass' ? 1 : 0;
  return {
    energyFunction: `V_t_weighted_closure|${input.proofSemanticsFingerprint}`,
    adaptationHistory: [
      { stepIndex: step, note: `eco_closure_${input.iterationKind}` },
    ],
    stabilityRetentionScore: retention,
  };
}
