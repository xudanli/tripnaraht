/**
 * P12 — Feasibility gate: simulation must not run on a globally infeasible proof.
 */

import type { ExecutionConstraintProof } from './constraint-proof.types';

export class ConstraintProofInfeasibleError extends Error {
  constructor(
    message: string,
    readonly proof: ExecutionConstraintProof,
  ) {
    super(message);
    this.name = 'ConstraintProofInfeasibleError';
  }
}

export function assertFeasibleBeforeSimulation(proof: ExecutionConstraintProof): void {
  if (proof.globalStatus === 'INFEASIBLE') {
    throw new ConstraintProofInfeasibleError(
      '[CONSTRAINT-PROOF] Execution plan infeasible',
      proof,
    );
  }
}
