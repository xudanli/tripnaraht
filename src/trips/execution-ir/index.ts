export type {
  ExecutionIR,
  ExecutionIRMeta,
  ExecutionIRMetric,
  ExecutionIRPatchOp,
  ExecutionIRSource,
  ExecutionIRStep,
} from './execution-ir.types';

export { ExecutionIRSources } from './execution-ir.types';

export { buildSteps, compileDAGToIR } from './compile-dag-to-ir';
export { executeExecutionIR, type ExecutionIRRunResult } from './execute-execution-ir';
export { assertIRCreatedOnlyByCompiler } from './ir-creation-guard';
export { stableExecutionDagId } from './stable-dag-id';
