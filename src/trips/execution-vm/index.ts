export type {
  ExecutionBytecodeArgs,
  ExecutionBytecodeInstruction,
  ExecutionBytecodeProgram,
  ExecutionOpCode,
} from './execution-bytecode.types';

export type { ExecutionTraceEvent } from './execution-trace.types';

export { compileIRToBytecode } from './compile-ir-to-bytecode';

export {
  executeBytecode,
  runExecutionIRAsVm,
  type ExecutionVMContext,
  type ExecutionVMOutcome,
  type ExecutionVMRunBundle,
  type ExecutionVMState,
} from './execution-vm';
