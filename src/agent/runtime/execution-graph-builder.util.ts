/**
 * P1 — Minimal execution graph snapshots for observability (not a full DAG engine).
 */

import type { ExecutionGraphEdge, ExecutionGraphNode, ExecutionGraphSnapshot } from './execution-graph.types';
import { EXECUTION_GRAPH_SCHEMA } from './execution-graph.types';

export type ExecutionGraphPathKind = 'DEDUP_REPLAY' | 'FRESH_EXECUTION';

export function buildExecutionGraphSnapshot(input: {
  queryId: string;
  requestId: string;
  artifactId: string;
  kernelTag: string;
  pathKind: ExecutionGraphPathKind;
  includeProofNode: boolean;
}): ExecutionGraphSnapshot {
  const lineage = input.requestId;
  const routingId = `n:${input.requestId}:routing`;
  const opId = `n:${input.requestId}:operator`;
  const sinkId =
    input.pathKind === 'DEDUP_REPLAY'
      ? `n:${input.requestId}:dedup_replay`
      : `n:${input.requestId}:fresh_sink`;

  const nodes: ExecutionGraphNode[] = [
    {
      id: routingId,
      kind: 'ROUTING',
      label: 'ECPS',
      proofLineageId: lineage,
      runtimeStateRef: input.requestId,
    },
    {
      id: opId,
      kind: 'OPERATOR',
      operatorTag: input.kernelTag,
      proofLineageId: lineage,
      runtimeStateRef: input.artifactId,
    },
    {
      id: sinkId,
      kind: input.pathKind === 'DEDUP_REPLAY' ? 'REPLAY' : 'OBSERVATION',
      label: input.pathKind === 'DEDUP_REPLAY' ? 'DEDUP_REPLAY' : 'FRESH_EXECUTION',
      proofLineageId: lineage,
    },
  ];

  if (input.includeProofNode) {
    nodes.push({
      id: `n:${input.requestId}:proof`,
      kind: 'PROOF',
      proofLineageId: lineage,
    });
  }

  const edges: ExecutionGraphEdge[] = [
    { fromId: routingId, toId: opId, dependency: 'CONTROL' },
    { fromId: opId, toId: sinkId, dependency: 'DATA' },
  ];
  if (input.includeProofNode) {
    edges.push({
      fromId: opId,
      toId: `n:${input.requestId}:proof`,
      dependency: 'PROOF',
    });
  }

  return {
    schema: EXECUTION_GRAPH_SCHEMA,
    queryId: input.queryId,
    nodes,
    edges,
  };
}
