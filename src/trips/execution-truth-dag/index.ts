export type {
  ExecutionEdge,
  ExecutionEdgeType,
  ExecutionNode,
  ExecutionNodeExecution,
  ExecutionNodeRepair,
  ExecutionNodeRoad,
  ExecutionNodeTemporal,
  ExecutionNodeWeather,
  ExecutionTruthDAG,
  ExecutionTruthFinalState,
  ExecutionTruthNodeType,
  ExecutionTruthRepairKind,
} from './execution-truth-dag.types';

export {
  buildExecutionTruthDAG,
  type BuildExecutionTruthDAGInput,
  type TemporalExecutionWindows,
} from './build-execution-truth-dag';

export {
  buildGraphPatchesFromRepairs,
  type ExecutionGraphPatch,
  type GraphPatchOp,
} from './build-graph-patches';

export { nodeIdForSlot, slotIdFromNodeId } from './dag-node-ids';

export { isExecutionTruthDAG } from './is-execution-truth-dag';

export {
  assertDAGCanonicalRepairInputs,
  assertNoDecisionOutsideIR,
  assertOnlyIRCompilerCanRun,
  assertRepairIRWitnessAligned,
  assertOnlyDAGIsDecisionSource,
  assertOnlyDAGIsDecisionSource_DEV,
  isDAGCanonicalLockEnabled,
  isIROnlyLockEnabled,
  isRepairIROnlyLockEnabled,
  type DAGCanonicalPolicy,
  type DecisionPathAudit,
  type IRCompilationEntrySite,
} from './dag-canonical-policy';

export {
  assertDagIsNonDecisionSource,
  isDagObserverOnlyEnabled,
  type DagObserverGuardInput,
  type DagObserverPolicyFields,
} from './dag-observer-lock';
