/**
 * P9 — deterministic bytecode VM (single execution kernel).
 */

import type { ExecutionTruthDAG } from '../execution-truth-dag/execution-truth-dag.types';
import type { ExecutionIR } from '../execution-ir/execution-ir.types';
import type { ExecutionBytecodeProgram } from './execution-bytecode.types';
import type { ExecutionTraceEvent } from './execution-trace.types';
import { compileIRToBytecode } from './compile-ir-to-bytecode';

export interface ExecutionVMContext {
  witnessDag?: ExecutionTruthDAG;
  /** P10：counterfactual runs — semantics identical; tags traces / audit. */
  mode?: 'NORMAL' | 'SIMULATION';
}

export interface ExecutionVMState {
  pathCost: number;
  failures: string[];
}

export interface ExecutionVMOutcome {
  finalState: ExecutionVMState;
  trace: ExecutionTraceEvent[];
}

function initVmState(): ExecutionVMState {
  return { pathCost: 0, failures: [] };
}

/**
 * Execute bytecode program — **no** wall-clock; `timestamp` in trace is logical step index.
 */
export function executeBytecode(
  program: ExecutionBytecodeProgram,
  context: ExecutionVMContext,
): ExecutionVMOutcome {
  const trace: ExecutionTraceEvent[] = [];
  const state = initVmState();
  let logicalClock = 0;

  const pushTrace = (op: string, traceId: string) => {
    trace.push({ op, traceId, timestamp: logicalClock });
    logicalClock += 1;
  };

  for (const ins of program.instructions) {
    switch (ins.op) {
      case 'CHECK': {
        const nodeId = ins.args.kind === 'CHECK' ? ins.args.nodeId : '';
        pushTrace('CHECK', ins.traceId);
        if (
          context.witnessDag &&
          !context.witnessDag.nodes.some(n => n.id === nodeId)
        ) {
          state.failures.push(`CHECK missing node ${nodeId}`);
        }
        break;
      }
      case 'PROJECT':
        pushTrace('PROJECT', ins.traceId);
        break;
      case 'TRAVERSE': {
        if (ins.args.kind !== 'TRAVERSE') {
          break;
        }
        state.pathCost += ins.args.cost;
        pushTrace('TRAVERSE', ins.traceId);
        break;
      }
      case 'PATCH':
        pushTrace('PATCH', ins.traceId);
        break;
      case 'JUMP':
        pushTrace('JUMP', ins.traceId);
        break;
      case 'HALT':
        pushTrace('HALT', ins.traceId);
        return { finalState: state, trace };
      default:
        break;
    }
  }

  return { finalState: state, trace };
}

export interface ExecutionVMRunBundle {
  program: ExecutionBytecodeProgram;
  outcome: ExecutionVMOutcome;
  irRun: {
    ok: boolean;
    pathCost: number;
    failures: string[];
  };
}

/** Single entry: IR → bytecode → VM — **唯一** 与 `executeExecutionIR` 对齐的语义路径。 */
export function runExecutionIRAsVm(
  ir: ExecutionIR,
  context: ExecutionVMContext,
): ExecutionVMRunBundle {
  const program = compileIRToBytecode(ir);
  const outcome = executeBytecode(program, context);
  const irRun = {
    ok: outcome.finalState.failures.length === 0,
    pathCost: outcome.finalState.pathCost,
    failures: outcome.finalState.failures,
  };
  return { program, outcome, irRun };
}
