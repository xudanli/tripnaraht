/**
 * P-Next 10 — Causal structure as first-class **hypothesis** (mutable, auditable).
 */

import type { CausalEdge, CausalGraph, CausalNode } from '../causal-physics/causal-graph.types';

export type CausalModelOrigin = 'OBSERVED' | 'INFERRED' | 'LEARNED';

export interface CausalModelMeta {
  confidence: number;
  origin: CausalModelOrigin;
  /** Increments on each structural revision (audit monotonicity). */
  revisionEpoch?: number;
}

/**
 * Wraps the same node/edge carriers as {@link CausalGraph} plus epistemic meta — the graph is no longer “given”.
 */
export interface CausalModel {
  /** Stable lineage id for consensus / replicas */
  modelId?: string;
  nodes: CausalNode[];
  edges: CausalEdge[];
  meta: CausalModelMeta;
}

/** Serializable revision step — proofs carry these instead of opaque mutations. */
export interface ModelPatch {
  id: string;
  edgeUpdates?: Array<{
    from: string;
    to: string;
    deltaWeight: number;
  }>;
  /** Additive to `meta.confidence` (clamped in applier). */
  metaConfidenceDelta?: number;
  /** Bump `revisionEpoch` when structural commitment changes. */
  bumpRevisionEpoch?: boolean;
  notes?: string;
}

export interface CausalEvidence {
  predictedUtility: number;
  observedUtility: number;
  /** Optional structural snapshot after execution — for drift vs predicted topology. */
  observedGraph?: CausalGraph;
}
