import { createHash } from 'crypto';
import type { ArtifactIdentityMaterial } from '../contracts/artifact-identity.types';

/** Stable JSON for `semanticInputs`: sorted keys, one level (extend if nested blobs appear). */
function stableSemanticInputsJson(inputs: Record<string, unknown>): string {
  const keys = Object.keys(inputs).sort();
  const sorted: Record<string, unknown> = {};
  for (const k of keys) sorted[k] = inputs[k];
  return JSON.stringify(sorted);
}

/**
 * Deterministic cognition-scoped id (SHA-256 hex).
 * Orthogonal to AgentService `hashRequest` (request dedup).
 */
export function computeArtifactIdentityHash(material: ArtifactIdentityMaterial): string {
  const canonical = {
    artifactType: material.artifactType,
    plannerVersion: material.plannerVersion ?? '',
    freshnessDependencies: [...(material.freshnessDependencies ?? [])].sort(),
    cognitionScope: material.cognitionScope,
    semanticFingerprint: stableSemanticInputsJson(
      (material.semanticInputs ?? {}) as Record<string, unknown>,
    ),
  };
  return createHash('sha256').update(JSON.stringify(canonical), 'utf8').digest('hex');
}
