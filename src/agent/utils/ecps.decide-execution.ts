/**
 * ECPS public entry — compiled execution policy (`ExecutionPolicyIR`) is the source of truth.
 *
 * Implementation lives in `execution-policy.interpreter.ts`; `decideExecution` compiles an
 * ephemeral IR from bias for backward compatibility.
 */

export {
  decideExecution,
  decideExecutionFromBaselineIr,
  interpretExecutionPolicyIR,
} from './execution-policy.interpreter';
