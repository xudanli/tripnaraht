/**
 * P3 — Persistence substrate: replay slices, partial recompute scopes, artifact evolution.
 * Store backends implement these records; agent runtime carries digests / ids.
 */

export const RUNTIME_PERSISTENCE_SCHEMA = 'runtime/persistence/v1' as const;

/** How this anchor row was emitted — fresh finalize vs dedup gateway admission. */
export type RuntimeReplayAdmissionPath = 'FRESH_FINALIZE' | 'DEDUP_REPLAY';

/** Serialized row for admin read API / tooling（BigInt → string）. */
export interface RuntimeReplayAnchorRow {
  id: string;
  snapshot_id: string;
  query_id: string;
  admission_path: RuntimeReplayAdmissionPath;
  dedup_request_hash: string | null;
  phi_digest: string;
  certificate_digest: string | null;
  artifact_refs: string[];
  schema_version: string;
  created_at_ms: string;
  created_at: string;
  partial_recompute_scope?: PartialRecomputeScope | null;
  artifact_evolution?: ArtifactEvolutionRecord | null;
}

/** Durable replay anchor — links to Φ / proof for verification passes. */
export interface ReplayPersistenceRecord {
  snapshotId: string;
  queryId: string;
  admissionPath: RuntimeReplayAdmissionPath;
  /** Stable digest of Φ or merged runtime row (hex/sha256 at store). */
  phiDigest: string;
  certificateDigest?: string;
  artifactRefs: string[];
  createdAtMs: number;
  partialRecomputeScope?: PartialRecomputeScope;
  artifactEvolution?: ArtifactEvolutionRecord;
}

/** Partial recompute boundary — maps to ECPS invalidationScope semantics. */
export interface PartialRecomputeScope {
  artifactIds: string[];
  invalidation: 'NONE' | 'PARTIAL' | 'FULL';
  reason?: string;
}

/** Artifact lineage for evolution / merge / dedup. */
export interface ArtifactEvolutionRecord {
  artifactId: string;
  version: number;
  parentArtifactId?: string;
  parentVersion?: number;
  metadataDigest?: string;
}
