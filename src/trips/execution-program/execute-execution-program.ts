/**
 * Neptune Runtime Engine — interpret ExecutionProgram against a concrete DAG witness.
 */

import type { ExecutionTruthDAG } from '../execution-truth-dag/execution-truth-dag.types';
import type { GraphPatchOp } from '../execution-truth-dag/build-graph-patches';
import type { ExecutionInstruction, ExecutionProgram } from './execution-program.types';

export interface ExecutionResult {
  ok: boolean;
  pathCost: number;
  /** Nodes where EXEC_CHECK rule ≠ live DAG finalState. */
  execCheckFailures: string[];
  projections: Array<{ nodeId: string; derive: string; value: number }>;
  mutations: Array<{ edgeId: string; op: GraphPatchOp }>;
}

function projectValue(
  dag: ExecutionTruthDAG,
  nodeId: string,
  derive: 'delay' | 'reliability' | 'risk',
): number {
  const node = dag.nodes.find(n => n.id === nodeId);
  if (!node) {
    return NaN;
  }
  switch (derive) {
    case 'delay':
      return node.execution.delayMinutes;
    case 'reliability':
      return node.execution.reliabilityScore;
    case 'risk':
      return (
        (node.weather.exposureScore + node.temporal.arrivalRisk + (1 - node.road.accessibility)) /
        3
      );
    default:
      return NaN;
  }
}

function runInstruction(
  inst: ExecutionInstruction,
  dag: ExecutionTruthDAG,
  acc: ExecutionResult,
): void {
  switch (inst.type) {
    case 'EXEC_CHECK': {
      const node = dag.nodes.find(n => n.id === inst.nodeId);
      if (!node || node.execution.finalState !== inst.rule) {
        acc.execCheckFailures.push(inst.nodeId);
      }
      break;
    }
    case 'EDGE_TRAVERSE':
      acc.pathCost += inst.cost;
      break;
    case 'EDGE_MUTATE':
      acc.mutations.push({ edgeId: inst.edgeId, op: inst.op });
      break;
    case 'STATE_PROJECT': {
      const value = projectValue(dag, inst.nodeId, inst.derive);
      acc.projections.push({ nodeId: inst.nodeId, derive: inst.derive, value });
      break;
    }
    case 'BRANCH': {
      const sub = executeExecutionProgram(inst.subProgram, dag);
      acc.pathCost += sub.pathCost;
      acc.execCheckFailures.push(...sub.execCheckFailures);
      acc.projections.push(...sub.projections);
      acc.mutations.push(...sub.mutations);
      break;
    }
    default:
      break;
  }
}

/**
 * Deterministic interpreter — single pass over instruction stream.
 */
export function executeExecutionProgram(program: ExecutionProgram, dag: ExecutionTruthDAG): ExecutionResult {
  const acc: ExecutionResult = {
    ok: true,
    pathCost: 0,
    execCheckFailures: [],
    projections: [],
    mutations: [],
  };

  for (const inst of program.instructions) {
    runInstruction(inst, dag, acc);
  }

  acc.ok = acc.execCheckFailures.length === 0;
  return acc;
}

/** P7 Neptune evolution — program interpreter facade. */
export const NeptuneInterpreter = {
  execute: executeExecutionProgram,
};
