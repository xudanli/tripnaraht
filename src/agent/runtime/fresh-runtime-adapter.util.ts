/**
 * Attach runtime_materialization on fresh execution responses (non-dedup) using ECPS when ETK sealed it.
 */

import type { RouteAndRunRequestDto, RouteAndRunResponseDto } from '../dto/route-and-run.dto';
import type { ExecutionDecision } from '../contracts/execution-control-policy.types';
import type { ExecutionKernel } from '../contracts/execution-semantic-field.types';
import {
  buildRuntimeObservabilitySlice,
  shouldAttachDedupRuntimeObservability,
} from './dedup-runtime-adapter.util';
import { extractExecutionDecisionFromObservability } from './runtime-ecps-decision.extract';

function syntheticExecutionDecisionFromFreshObservability(
  obs: RouteAndRunResponseDto['observability'] | undefined,
): ExecutionDecision {
  const policy = obs?.trace?.route_decision?.route_policy;
  const kernel: ExecutionKernel =
    policy === 'LEGACY' ? 'LIGHTWEIGHT_KERNEL' : 'REASONING_KERNEL';
  return {
    mode: 'RECOMPUTE',
    kernel,
    features: {
      intensity: 0.55,
      entropy: 0.35,
      determinism: 0.5,
      toolDepth: 'MEDIUM',
    },
    toolDepth: 'MEDIUM',
    invalidationScope: 'NONE',
    confidenceGate: 'MEDIUM',
  };
}

/**
 * Mutates `response.observability.runtime_materialization` when env enabled and slot free.
 */
export function attachFreshRuntimeMaterialization(
  request: RouteAndRunRequestDto,
  response: RouteAndRunResponseDto,
): void {
  if (!shouldAttachDedupRuntimeObservability()) return;
  if (!response.observability) return;
  const obs = response.observability as Record<string, unknown>;
  if (obs.runtime_materialization) return;

  const decision =
    extractExecutionDecisionFromObservability(response.observability) ??
    syntheticExecutionDecisionFromFreshObservability(response.observability);
  const artifactId =
    request.trip_id && typeof request.trip_id === 'string' && request.trip_id.trim().length > 0
      ? request.trip_id.trim()
      : request.request_id;

  obs.runtime_materialization = buildRuntimeObservabilitySlice({
    requestId: request.request_id,
    artifactId,
    decision,
    replayEligible: false,
    pathKind: 'FRESH_EXECUTION',
  });
}
