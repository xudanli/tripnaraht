export type {
  ExecutionMemoryEvent,
  ExecutionMemoryEventType,
  ExecutionMemoryGraph,
  ExecutionMemorySnapshot,
  ExecutionReplayState,
} from './execution-memory.types';

export { hashExecutionOverlayFrames } from './hash-canonical';
export { buildExecutionSnapshot, type BuildExecutionSnapshotContext } from './build-execution-snapshot';
export {
  recordExecutionMemory,
  appendExecutionSnapshot,
  createExecutionMemoryEventId,
} from './record-execution-memory';

export {
  getExecutionMemoryGraph,
  clearExecutionMemoryStore,
} from './memory-store';

export { stableExecutionIrId } from './stable-execution-ir-id';

export { replayExecution, snapshotsAreDeterministicallyAligned } from './replay-execution';

export {
  runCounterfactual,
  type CounterfactualExecutionResult,
  type ExecutionTruthDagMutation,
} from './counterfactual-execution';
