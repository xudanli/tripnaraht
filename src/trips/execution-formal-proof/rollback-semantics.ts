/**
 * Rollback hints driven by contraction certificate — does not mutate world state here.
 */

import type { ContractionProof } from './contraction-proof.types';

/** True when operator step should be treated as mathematically unsafe (revert witness elsewhere). */
export function shouldRevertToLastStable(proof: ContractionProof): boolean {
  return proof.suggestRollback;
}
