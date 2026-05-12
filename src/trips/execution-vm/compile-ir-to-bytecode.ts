/**
 * IR → deterministic bytecode — single lowering from frozen ExecutionIR.
 */

import type { ExecutionIR, ExecutionIRStep } from '../execution-ir/execution-ir.types';
import type { ExecutionBytecodeInstruction, ExecutionBytecodeProgram } from './execution-bytecode.types';

function traceIdForIRStep(step: ExecutionIRStep): string {
  switch (step.type) {
    case 'CHECK':
      return `check:${step.nodeId}`;
    case 'PROJECT':
      return `project:${step.nodeId}:${step.metric}`;
    case 'TRAVERSE':
      return `traverse:${step.edgeId}`;
    case 'PATCH':
      return `patch:${step.edgeId}:${step.op}`;
    default:
      return 'unknown';
  }
}

function lowerStep(step: ExecutionIRStep): ExecutionBytecodeInstruction {
  const traceId = traceIdForIRStep(step);
  switch (step.type) {
    case 'CHECK':
      return {
        op: 'CHECK',
        args: { kind: 'CHECK', nodeId: step.nodeId },
        traceId,
      };
    case 'PROJECT':
      return {
        op: 'PROJECT',
        args: {
          kind: 'PROJECT',
          nodeId: step.nodeId,
          metric: step.metric,
        },
        traceId,
      };
    case 'TRAVERSE':
      return {
        op: 'TRAVERSE',
        args: {
          kind: 'TRAVERSE',
          edgeId: step.edgeId,
          cost: step.cost,
        },
        traceId,
      };
    case 'PATCH':
      return {
        op: 'PATCH',
        args: {
          kind: 'PATCH',
          edgeId: step.edgeId,
          op: step.op,
        },
        traceId,
      };
  }
}

export function compileIRToBytecode(ir: ExecutionIR): ExecutionBytecodeProgram {
  const instructions: ExecutionBytecodeInstruction[] = [];

  for (const step of ir.steps) {
    instructions.push(lowerStep(step));
  }

  instructions.push({
    op: 'HALT',
    args: { kind: 'HALT' },
    traceId: 'halt',
  });

  return {
    version: '1',
    dagId: ir.meta.dagId,
    instructions,
  };
}
