/**
 * Resolve ECPS ExecutionDecision from observability when present (ETK execution_trace).
 */

import type { ExecutionDecision } from '../contracts/execution-control-policy.types';
import type { ExecutionTrace } from '../contracts/execution-trace.types';
import type { RouteAndRunResponseDto } from '../dto/route-and-run.dto';

function isExecutionDecision(x: unknown): x is ExecutionDecision {
  if (typeof x !== 'object' || x === null) return false;
  const o = x as Record<string, unknown>;
  return (
    typeof o.mode === 'string' &&
    typeof o.kernel === 'string' &&
    typeof o.invalidationScope === 'string' &&
    o.features !== undefined
  );
}

/** Prefer sealed `execution_trace.decision`; absent when fresh path did not emit ETK. */
export function extractExecutionDecisionFromObservability(
  obs: RouteAndRunResponseDto['observability'] | undefined,
): ExecutionDecision | undefined {
  const trace = obs?.execution_trace as ExecutionTrace | undefined;
  if (trace?.decision && isExecutionDecision(trace.decision)) {
    return trace.decision;
  }
  return undefined;
}
