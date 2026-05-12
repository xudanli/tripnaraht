/**
 * Artifact Identity — cognition-scoped identity orthogonal to `hashRequest(request)` (request dedup).
 *
 * Multiple artifacts from one request share the same request id but differ by `artifactId`.
 */

import type { ReplayArtifactType } from './replay-artifact-kinds.types';

/**
 * Coarse scope label for which cognition slice this artifact memoizes
 * (e.g. joined domains, branch key, or explicit pipeline stage).
 */
export type CognitionScope = string;

/**
 * Canonical inputs hashed into `artifactId`. Extend `semanticInputs` as sub-artifacts appear.
 */
export interface ArtifactIdentityMaterial {
  artifactType: ReplayArtifactType;
  /** Planner / pipeline build id (align with ReplayProvenance.plannerVersion). */
  plannerVersion?: string;
  /** Freshness dimensions this artifact depends on (sorted at hash time). */
  freshnessDependencies?: string[];
  /** Distinct cognitive slice vs other artifacts from the same request. */
  cognitionScope: CognitionScope;
  /**
   * Stable semantic fingerprint for reuse decisions (route label, world snapshot ref, etc.).
   * Not the full user message — request dedup remains separate.
   */
  semanticInputs?: Record<string, unknown>;
}

export interface ArtifactIdentity {
  /** Deterministic `sha256` hex over canonicalized `material`. */
  artifactId: string;
  material: ArtifactIdentityMaterial;
}
