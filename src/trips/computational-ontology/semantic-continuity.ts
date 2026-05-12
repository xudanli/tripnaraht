/**
 * P-ECO-Closure-10 — Lineage + continuity mass across DAG/IR/policy mutation.
 */

import { createHash } from 'crypto';
import type { MetaReflection } from '../meta-reflection/meta-reflection.types';

export interface SemanticContinuity {
  preservedInvariants: string[];
  /** [0,1] — normalized drift of Φ vs priors + causal churn. */
  mutationDistance: number;
  /** Compact lineage fingerprint (trip identity × causal epoch). */
  reflectiveLineage: string;
  /** [0,1] — confidence that semantics remain the same system. */
  continuityConfidence: number;
}

function clamp01(x: number): number {
  return Math.min(1, Math.max(0, x));
}

export function buildSemanticContinuity(input: {
  executionSemanticCoreHash: string;
  causalModelId?: string;
  revisionEpoch: number;
  metaReflection: MetaReflection;
}): SemanticContinuity {
  const lineageRaw = `${input.executionSemanticCoreHash}|${input.causalModelId ?? '∅'}|epoch:${input.revisionEpoch}`;
  const reflectiveLineage = createHash('sha256')
    .update(lineageRaw, 'utf8')
    .digest('hex')
    .slice(0, 28);

  const mutationDistance = clamp01(
    0.38 * input.metaReflection.policyDrift +
      0.32 * input.metaReflection.convergenceRuleChange +
      0.18 * input.metaReflection.semanticMutation +
      0.12 * input.metaReflection.causalTopologyMutation,
  );

  const continuityConfidence = clamp01(
    1 - mutationDistance * 0.85 + (input.revisionEpoch > 0 ? 0.02 : 0),
  );

  const preservedInvariants = [
    'trip_context_binding',
    input.revisionEpoch <= 8 ? 'causal_revision_bounded' : 'causal_revision_heavy',
  ];

  return {
    preservedInvariants,
    mutationDistance,
    reflectiveLineage,
    continuityConfidence,
  };
}
