/**
 * P-Next 10 — Consensus over **causal hypotheses**, not only state vectors.
 */

import type { CausalModel } from '../causal-reflection/causal-model.types';

export interface CausalModelReplica {
  replicaId: string;
  model: CausalModel;
  /**
   * Held-out prediction / structural error — lower is better.
   * Caller supplies from validation slice or cross-run residual.
   */
  modelError: number;
}

/**
 * Select the hypothesis that **best explains** pooled evidence — argmin `modelError`.
 */
export function selectBestCausalModel(replicas: CausalModelReplica[]): CausalModelReplica {
  if (!replicas.length) {
    throw new Error('CAUSAL_MODEL_CONSENSUS_EMPTY');
  }
  const sorted = [...replicas].sort((a, b) => a.modelError - b.modelError);
  return sorted[0]!;
}
