/**
 * Replay Artifact Descriptor — transition layer from response-centric cache to artifact-centric cognition reuse.
 *
 * Today `cacheResponse(response)` remains the transport; this type makes replay semantics explicit without a full registry.
 */

import type { ArtifactIdentity } from './artifact-identity.types';
import type { ArtifactReplayConfidence } from './artifact-replay-confidence.types';
import type { ReplayEligibilityClass, ReplayArtifactType } from './replay-artifact-kinds.types';
import type { ReplayProvenance } from './replay-provenance.types';

export type { ReplayArtifactType, ReplayEligibilityClass } from './replay-artifact-kinds.types';

export interface ReplayArtifactDescriptor {
  artifactType: ReplayArtifactType;
  /**
   * Cognition identity for this artifact — **not** `hashRequest` (request-centric dedup).
   * Enables multi-artifact incremental reuse under one request.
   */
  artifactIdentity: ArtifactIdentity;
  replayEligibility: ReplayEligibilityClass;
  /** Replay / validity confidence — drives fuzzy reuse, dependency propagation, scheduler (future). */
  replayConfidence: ArtifactReplayConfidence;
  provenance: ReplayProvenance;
  /** Freshness dimensions this artifact consults (WorldFreshnessVector keys, etc.). */
  freshnessDependencies?: string[];
  /** Coarse invalidation / partial recompute hooks (aligned with anomaly attribution). */
  affectedCognitiveDomains?: string[];
}
