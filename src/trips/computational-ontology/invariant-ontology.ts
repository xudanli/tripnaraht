/**
 * P-ECO-Closure-10 — Which obligations remain necessarily true for the system to remain itself.
 */

import type { SemanticTrustCore } from '../recursive-semantics/semantic-trust-core';

export interface InvariantOntology {
  physicalSafety: boolean;
  proofIntegrity: boolean;
  identityContinuity: boolean;
  semanticCore: boolean;
  terminationAxioms: boolean;
}

export function buildInvariantOntology(input: {
  trustCore: SemanticTrustCore;
  suggestRollback: boolean;
  withinMutationEnvelope: boolean;
}): InvariantOntology {
  return {
    physicalSafety: true,
    proofIntegrity: !input.suggestRollback,
    identityContinuity: input.withinMutationEnvelope,
    semanticCore: input.trustCore.invariantLayersFrozen,
    /** Hard termination / budget axioms remain nominally enforced at kernel level. */
    terminationAxioms: true,
  };
}

export function invariantOntologyIntegrityScore(o: InvariantOntology): number {
  const vals = [
    o.physicalSafety,
    o.proofIntegrity,
    o.identityContinuity,
    o.semanticCore,
    o.terminationAxioms,
  ];
  return vals.filter(Boolean).length / vals.length;
}
