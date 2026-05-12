import type { ExecutionIdentity } from '../identity-preservation/identity-preservation.types';
import type { SemanticTrustCore } from './semantic-trust-core';
import type { ComputationalIdentity } from './computational-identity.types';
import type { RecursiveBoundaryResult } from './recursive-boundary';

function clamp01(x: number): number {
  return Math.min(1, Math.max(0, x));
}

export function buildComputationalIdentity(input: {
  executionIdentity: ExecutionIdentity;
  trustCore: SemanticTrustCore;
  boundary: RecursiveBoundaryResult;
}): ComputationalIdentity {
  const continuity = clamp01(
    0.65 + 0.35 * (1 - input.executionIdentity.mutationEnvelope),
  );
  const depthUsed = Math.min(
    1,
    input.boundary.currentDepth / Math.max(1, input.boundary.maxDepth),
  );
  const reflectiveBoundary = clamp01(
    input.boundary.freezeReflection ? 0.28 : 1 - 0.85 * depthUsed,
  );

  return {
    coreAxioms: [...input.trustCore.axiomaticTags],
    semanticContinuity: continuity,
    reflectiveBoundary,
    trustedKernel: input.trustCore.trustKernelVersion,
  };
}
