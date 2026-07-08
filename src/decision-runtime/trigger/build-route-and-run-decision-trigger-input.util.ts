/**
 * Maps route_and_run requests to DecisionTriggerInput hints (no dispatch — Agentic layer).
 * Formal decisions still require Decision Center / Trigger Gateway dispatch elsewhere.
 */

import type { RouteAndRunRequestDto } from '../../agent/dto/route-and-run.dto';
import type {
  DecisionRunRequestSource,
  DecisionTriggerInput,
  DecisionTriggerKind,
} from '../contracts/decision-run-request';

export type RouteAndRunDecisionTriggerObservabilityV1 = {
  revision: 'v1';
  /** Structured hint — not a formal DecisionRun unless gateway dispatch enabled */
  trigger_input: DecisionTriggerInput;
  run_request?: import('../contracts/decision-run-request').DecisionRunRequest;
  note: 'agentic_hint_only' | 'agentic_dispatch_advisory';
};

function resolveAgenticTriggerKind(request: RouteAndRunRequestDto): DecisionTriggerKind {
  const taskType = String(request.options?.intent_mode ?? '').toUpperCase();
  if (taskType.includes('REPLAN') || taskType.includes('RECOVERY')) {
    return 'IN_TRIP_DEVIATION';
  }
  if (taskType.includes('REPAIR')) {
    return 'MANUAL_REPAIR_REQUEST';
  }
  return 'LEGACY_AGENT_ROUTE';
}

export function buildRouteAndRunDecisionTriggerInput(
  request: RouteAndRunRequestDto,
): DecisionTriggerInput | null {
  const tripId = String(request.trip_id ?? '').trim();
  if (!tripId) {
    return null;
  }

  const source: DecisionRunRequestSource = 'AGENT_ROUTE_AND_RUN';
  const requestId = String(request.request_id ?? '').trim() || undefined;

  return {
    kind: resolveAgenticTriggerKind(request),
    tripId,
    source,
    requestId,
    userId: request.user_id?.trim() || undefined,
    metadata: {
      entryPointId: 'agent.route-and-run',
      intent: 'agentic_orchestration',
      intent_mode: request.options?.intent_mode,
      entry_point: request.options?.entry_point,
      orchestration_active_sub_agent: request.options?.orchestration_active_sub_agent,
      message_preview: request.message?.slice(0, 120),
    },
  };
}

export function buildRouteAndRunDecisionTriggerObservability(input: {
  triggerInput: DecisionTriggerInput;
  runRequest?: import('../contracts/decision-run-request').DecisionRunRequest;
  gatewayDispatched?: boolean;
}): RouteAndRunDecisionTriggerObservabilityV1 {
  return {
    revision: 'v1',
    trigger_input: input.triggerInput,
    run_request: input.runRequest,
    note: input.gatewayDispatched ? 'agentic_dispatch_advisory' : 'agentic_hint_only',
  };
}
