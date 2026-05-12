/**
 * P12 — Build a deterministic Constraint Proof Graph from ExecutionTruthDAG.
 */

import type { ExecutionEdge, ExecutionNode, ExecutionTruthDAG } from '../execution-truth-dag/execution-truth-dag.types';
import { stableExecutionDagId } from '../execution-ir/stable-dag-id';
import type {
  ConstraintProofEdge,
  ConstraintProofGlobalStatus,
  ConstraintProofNode,
  ExecutionConstraintProof,
} from './constraint-proof.types';

const STRUCTURAL_EDGE_TYPES = new Set<ExecutionEdge['type']>([
  'TEMPORAL_SEQUENCE',
  'CROSS_DAY_SPILL',
  'ROUTE_DEPENDENCY',
  'WEATHER_DEPENDENCY',
  'REPAIR_DEPENDENCY',
]);

const STRUCTURAL_ACYCLICITY_ID = '__p12:structural:acyclicity';

/** Hard invariants that block simulation (travel impossible / unsafe / closed). */
export function evaluateNodeConstraint(node: ExecutionNode): Pick<
  ConstraintProofNode,
  'type' | 'constraint' | 'status'
> {
  const hardParts: string[] = [];
  if (node.execution.finalState === 'BLOCKED') {
    hardParts.push('execution.blocked');
  }
  if (node.temporal.daylightViolation) {
    hardParts.push('temporal.daylightUnsafe');
  }
  if (node.road.accessibility <= 0) {
    hardParts.push('road.closedOrUnreachable');
  }

  if (hardParts.length > 0) {
    return {
      type: 'HARD',
      constraint: hardParts.join(';'),
      status: 'UNSAT',
    };
  }

  const softParts: string[] = [];
  if (node.execution.finalState === 'HARD') {
    softParts.push('execution.highRisk');
  } else if (node.execution.finalState === 'DEGRADED') {
    softParts.push('execution.degraded');
  } else if (node.execution.finalState === 'SOFT') {
    softParts.push('execution.soft');
  }
  if (node.weather.exposureScore >= 0.85) {
    softParts.push('weather.highDiscomfort');
  }
  if (node.temporal.crossDayRisk >= 0.65) {
    softParts.push('temporal.crossDayStress');
  }

  return {
    type: 'SOFT',
    constraint: softParts.length > 0 ? softParts.join(';') : 'execution.ok',
    status: 'SAT',
  };
}

export function analyzeConstraintRelation(edge: ExecutionEdge): ConstraintProofEdge {
  const implication: ConstraintProofEdge['implication'] =
    edge.type === 'TEMPORAL_SEQUENCE' ? 'IMPLIES' : 'DEPENDS_ON';
  return {
    from: edge.from,
    to: edge.to,
    implication,
  };
}

function hasDirectedCycle(dag: ExecutionTruthDAG): boolean {
  const adj = new Map<string, string[]>();
  const nodes = new Set<string>();
  for (const n of dag.nodes) {
    nodes.add(n.id);
    adj.set(n.id, []);
  }
  for (const e of dag.edges) {
    if (!STRUCTURAL_EDGE_TYPES.has(e.type)) {
      continue;
    }
    if (!nodes.has(e.from) || !nodes.has(e.to)) {
      continue;
    }
    adj.get(e.from)!.push(e.to);
  }

  const visiting = new Set<string>();
  const visited = new Set<string>();

  function dfs(u: string): boolean {
    if (visiting.has(u)) {
      return true;
    }
    if (visited.has(u)) {
      return false;
    }
    visiting.add(u);
    for (const v of adj.get(u) ?? []) {
      if (dfs(v)) {
        return true;
      }
    }
    visiting.delete(u);
    visited.add(u);
    return false;
  }

  for (const id of nodes) {
    if (!visited.has(id) && dfs(id)) {
      return true;
    }
  }
  return false;
}

function structuralAcyclicityNode(cyclic: boolean): ConstraintProofNode {
  return {
    id: STRUCTURAL_ACYCLICITY_ID,
    type: 'HARD',
    constraint: 'dag.structuralAcyclicity',
    status: cyclic ? 'UNSAT' : 'SAT',
  };
}

export function computeGlobalFeasibility(
  nodes: ConstraintProofNode[],
): ConstraintProofGlobalStatus {
  const hard = nodes.filter(n => n.type === 'HARD');
  if (hard.some(n => n.status === 'UNSAT')) {
    return 'INFEASIBLE';
  }
  if (hard.some(n => n.status === 'UNKNOWN')) {
    return 'UNCERTAIN';
  }
  return 'FEASIBLE';
}

export function buildConstraintProof(dag: ExecutionTruthDAG): ExecutionConstraintProof {
  const nodes: ConstraintProofNode[] = [];
  const edges: ConstraintProofEdge[] = [];

  for (const node of dag.nodes) {
    const ev = evaluateNodeConstraint(node);
    nodes.push({
      id: node.id,
      type: ev.type,
      constraint: ev.constraint,
      status: ev.status,
    });
  }

  for (const edge of dag.edges) {
    edges.push(analyzeConstraintRelation(edge));
  }

  const cyclic = hasDirectedCycle(dag);
  nodes.push(structuralAcyclicityNode(cyclic));

  const globalStatus = computeGlobalFeasibility(nodes);

  return {
    dagId: stableExecutionDagId(dag),
    nodes,
    edges,
    globalStatus,
  };
}
