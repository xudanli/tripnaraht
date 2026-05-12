/**
 * Execution Engine Router — declarative binding between ECPS `ExecutionDecision` and concrete runners.
 */

import type { RouteAndRunRequestDto, RouteAndRunResponseDto } from '../dto/route-and-run.dto';
import type {
  ExecutionControlContext,
  ExecutionDecision,
  ExecutionEngineType,
} from './execution-control-policy.types';
import type { ExecutionKernel } from './execution-semantic-field.types';

export type { ExecutionEngineType };

/** Payload passed into engine-specific runners (policy contract + request). */
export interface ExecutionEngineRunPayload {
  request: RouteAndRunRequestDto;
  /** Present when ECPS had enough signals; optional on fresh-only paths. */
  control?: ExecutionControlContext;
  decision: ExecutionDecision;
}

/**
 * Injected runners map legacy subsystems (System1 / ReAct / SM / lightweight) behind one interface.
 */
export interface ExecutionEngineRunners {
  system1: (payload: ExecutionEngineRunPayload) => Promise<RouteAndRunResponseDto>;
  lightweightQa: (payload: ExecutionEngineRunPayload) => Promise<RouteAndRunResponseDto>;
  system2React: (payload: ExecutionEngineRunPayload) => Promise<RouteAndRunResponseDto>;
  system2StateMachine: (payload: ExecutionEngineRunPayload) => Promise<RouteAndRunResponseDto>;
}

/** Declarative kernel profile (for trace / future arbitration). */
export interface ExecutionEngineRuntimeProfile {
  /** Authoritative ECPS kernel. */
  kernel: ExecutionKernel;
  /** Legacy runner tier — projection from kernel (+ optional mode hint) for adapters. */
  engine: ExecutionEngineType;
  capabilities: {
    toolLoop: boolean;
    openEndedReasoning: boolean;
    workflowConstraints: boolean;
  };
}
