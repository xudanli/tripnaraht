/**
 * Execution state as causal projection — not a single snapshot.
 */

export interface StateVariant {
  key: string;
  /** Maps to DAG execution posture / overlay-derived posture labels. */
  posture: string;
}

export interface ExecutionStateProjection {
  nodeId: string;
  possibleStates: StateVariant[];
  /** Same length as possibleStates; sums to ~1 after normalization in builders. */
  probabilityDistribution: number[];
  collapseRule: 'EAGER' | 'DEFERRED' | 'EXTERNALIZED';
}
