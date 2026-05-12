/**
 * P1 — Execution graph: nodes, edges, dependencies, operator tags, proof lineage.
 * Persistence / scheduler attach opaque payloads via refs into UnifiedRuntimeState.
 */

export const EXECUTION_GRAPH_SCHEMA = 'runtime/execution-graph/v1' as const;

export type ExecutionGraphNodeKind =
  | 'OPERATOR'
  | 'OBSERVATION'
  | 'ARTIFACT'
  | 'PROOF'
  | 'ROUTING'
  | 'REPLAY'
  | 'SPCL';

export type ExecutionGraphDependencyKind =
  | 'DATA'
  | 'CONTROL'
  | 'PROOF'
  | 'SCHEDULE'
  | 'KERNEL';

export interface ExecutionGraphNode {
  id: string;
  kind: ExecutionGraphNodeKind;
  /** OFDL / UKHF / ECPS tag for observability. */
  operatorTag?: string;
  /** Chain id for π_proof / certificate ancestry. */
  proofLineageId?: string;
  /** Points at UnifiedRuntimeState.tickId or external store key. */
  runtimeStateRef?: string;
  label?: string;
}

export interface ExecutionGraphEdge {
  fromId: string;
  toId: string;
  dependency: ExecutionGraphDependencyKind;
}

export interface ExecutionGraphSnapshot {
  schema: typeof EXECUTION_GRAPH_SCHEMA;
  queryId: string;
  nodes: ExecutionGraphNode[];
  edges: ExecutionGraphEdge[];
}
