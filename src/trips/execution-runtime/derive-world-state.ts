import type { ExecutionTruthDAG } from '../execution-truth-dag/execution-truth-dag.types';
import type { ExecutionWorldState } from './execution-runtime.types';

/**
 * Projects world state onto an induced subgraph (active node id set).
 */
export function deriveExecutionWorldState(
  dag: ExecutionTruthDAG,
  activeNodeIds: ReadonlySet<string>,
): ExecutionWorldState {
  const activeNodes = dag.nodes.filter(n => activeNodeIds.has(n.id));
  const activeEdges = dag.edges.filter(
    e => activeNodeIds.has(e.from) && activeNodeIds.has(e.to),
  );

  const totalDelay = activeNodes.reduce((s, n) => s + n.execution.delayMinutes, 0);
  const blockedSlots = activeNodes
    .filter(n => n.execution.finalState === 'BLOCKED')
    .map(n => n.slotId)
    .filter((x): x is string => Boolean(x));

  const riskExposure =
    activeNodes.length === 0
      ? 0
      : activeNodes.reduce((s, n) => s + n.weather.exposureScore, 0) / activeNodes.length;

  const reliabilityCurve = activeNodes.map(n => n.execution.reliabilityScore);

  return {
    activeNodes,
    activeEdges,
    derivedState: {
      totalDelay,
      blockedSlots,
      riskExposure,
      reliabilityCurve,
    },
  };
}
