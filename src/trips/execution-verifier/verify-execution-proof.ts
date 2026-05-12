/**
 * P-Next 5 / P-Next 6 — Replay hashes, invariant suite, and optional semantic-grade replay.
 */

import type { ExecutionProof } from '../execution-trace-compressor/execution-proof.types';
import { recomputeHashesFromWitness } from '../execution-trace-compressor/build-execution-proof';
import { DEFAULT_EXECUTION_INVARIANTS } from '../execution-invariants/default-invariants';
import type { ExecutionInvariant } from '../execution-invariants/execution-invariant.types';
import {
  DEFAULT_EXECUTION_SEMANTICS_V1,
  SEMANTICS_PROFILE_DEFAULT_V1,
} from '../execution-semantics/default-execution-semantics-v1';
import { evaluateExecutionSemantics } from '../execution-semantics/evaluate-execution-semantics';
import { reconstructPhysicsFieldIndexFromWitness } from '../execution-semantics/reconstruct-physics-from-witness';

export interface VerifyExecutionProofOptions {
  /** Override registry — defaults to {@link DEFAULT_EXECUTION_INVARIANTS}. */
  invariants?: ExecutionInvariant[];
}

export interface ExecutionProofVerificationResult {
  valid: boolean;
  failedInvariant?: string;
  hashRootMatch: boolean;
  hashDecisionMatch: boolean;
}

/**
 * Recomputes semantic distances from witness + profile — must match embedded evaluations.
 */
export function verifySemanticProofLayer(proof: ExecutionProof): {
  ok: boolean;
  reason?: string;
} {
  if (!proof.semanticsVersion) {
    return { ok: true };
  }
  if (proof.semanticsProfileId !== SEMANTICS_PROFILE_DEFAULT_V1) {
    return { ok: false, reason: 'UNKNOWN_SEMANTICS_PROFILE' };
  }

  const idx = reconstructPhysicsFieldIndexFromWitness(proof.witness);
  const recomputed = evaluateExecutionSemantics(DEFAULT_EXECUTION_SEMANTICS_V1, {
    physicsFieldIndex: idx,
    daylightViolationLegIds: proof.witness.semanticOverlayHints?.daylightViolationLegIds,
    semanticsProfileId: SEMANTICS_PROFILE_DEFAULT_V1,
  });

  const evOk =
    JSON.stringify(recomputed.evaluations) === JSON.stringify(proof.evaluations);
  const vOk =
    JSON.stringify(recomputed.violations) === JSON.stringify(proof.violations);
  const dOk =
    Math.abs(
      (recomputed.semanticAggregateDistance ?? 0) - (proof.semanticAggregateDistance ?? 0),
    ) < 1e-12;

  if (!evOk || !vOk || !dOk) {
    return { ok: false, reason: 'SEMANTIC_EVALUATION_DRIFT' };
  }
  return { ok: true };
}

export function verifyExecutionProof(
  proof: ExecutionProof,
  options?: VerifyExecutionProofOptions,
): ExecutionProofVerificationResult {
  const recomputed = recomputeHashesFromWitness(proof.witness);
  const hashRootMatch = recomputed.rootStateHash === proof.rootStateHash;
  const hashDecisionMatch = recomputed.decisionHash === proof.decisionHash;

  if (!hashRootMatch || !hashDecisionMatch) {
    return {
      valid: false,
      failedInvariant: 'PROOF_HASH_MISMATCH',
      hashRootMatch,
      hashDecisionMatch,
    };
  }

  const suite = options?.invariants ?? DEFAULT_EXECUTION_INVARIANTS;
  for (const inv of suite) {
    if (!inv.check(proof)) {
      return {
        valid: false,
        failedInvariant: inv.id,
        hashRootMatch,
        hashDecisionMatch,
      };
    }
  }

  const semantic = verifySemanticProofLayer(proof);
  if (!semantic.ok) {
    return {
      valid: false,
      failedInvariant: semantic.reason ?? 'SEMANTIC_LAYER',
      hashRootMatch,
      hashDecisionMatch,
    };
  }

  return { valid: true, hashRootMatch, hashDecisionMatch };
}
