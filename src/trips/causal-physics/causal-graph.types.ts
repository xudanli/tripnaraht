/**
 * P-Next 9 — Explicit causal structure over physical factors (decision object, not only state projection).
 */

export type CausalNodeType =
  | 'WEATHER'
  | 'ROUTE'
  | 'FUEL'
  | 'TEMPORAL'
  | 'AGENT_ACTION';

export type CausalRelation = 'CAUSES' | 'CONSTRAINS' | 'AMPLIFIES';

export interface CausalNode {
  id: string;
  type: CausalNodeType;
  /** Observable / latent scalars — kept JSON-serializable for proofs. */
  state: Record<string, unknown>;
}

export interface CausalEdge {
  from: string;
  to: string;
  relation: CausalRelation;
  /** Structural strength in [0, 1]; updated by feedback correction. */
  weight: number;
}

export interface CausalGraph {
  nodes: CausalNode[];
  edges: CausalEdge[];
}

/**
 * Pearl-style atomic intervention: replace/freeze mechanism at `targetNodeId`.
 */
export interface CausalIntervention {
  id: string;
  targetNodeId: string;
  /** When true, incoming causal edges are ignored for this node during mutilated simulation. */
  doOperator: boolean;
  /** Shallow-merge into target node `state` after graph clone. */
  statePatch: Record<string, unknown>;
}

/** Snapshot along intervention rollout (audit / replay). */
export interface StateTrajectoryStep {
  stepIndex: number;
  /** Compact narrative or serialized graph fingerprint */
  label: string;
  /** Optional scalar utility at this step */
  utility?: number;
}
