/**
 * P-ECO-Closure-7 — Meta-state: the evolving policy Φ that parametrizes dynamics F.
 */

/** Fingerprints / channels for how closure and proofs are configured this tick. */
export interface MetaExecutionState {
  convergencePolicy: string;
  patchStrategy: string;
  causalUpdatePolicy: string;
  proofSemantics: string;
  /** [0,1] aggregate rate of policy / semantic motion vs baselines. */
  adaptationRate: number;
}
