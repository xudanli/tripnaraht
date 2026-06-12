/**
 * Route / shadow observability: trace ↔ top-level mirror (Response 镜像 SSOT).
 */

import type { ShadowRoutingEvalV1 } from './routing-classifier-eval.types';
import type { RouteClassForkV1 } from './route-and-run-route-class-fork.util';
import type { ShadowRouteClassEvalV1 } from './route-and-run-routing-protocol.types';

export const ROUTE_OBSERVABILITY_MIRROR_KEYS = [
  'route_class_fork_v1',
  'route_class_eval_v1',
  'shadow_routing_eval_v1',
] as const;

export type RouteObservabilityMirrorKey = (typeof ROUTE_OBSERVABILITY_MIRROR_KEYS)[number];

export interface RouteObservabilityRoutingEchoInput {
  routeClassFork?: RouteClassForkV1 | null;
  routeClassEval?: ShadowRouteClassEvalV1;
  shadowRoutingEval?: ShadowRoutingEvalV1;
}

/** Build top-level + trace echo payload (same keys, same objects). */
export function buildRouteObservabilityRoutingEcho(
  input: RouteObservabilityRoutingEchoInput,
): Partial<Record<RouteObservabilityMirrorKey, unknown>> {
  const out: Partial<Record<RouteObservabilityMirrorKey, unknown>> = {};
  if (input.routeClassFork) {
    out.route_class_fork_v1 = input.routeClassFork;
  }
  if (input.routeClassEval) {
    out.route_class_eval_v1 = input.routeClassEval;
  }
  if (input.shadowRoutingEval) {
    out.shadow_routing_eval_v1 = input.shadowRoutingEval;
  }
  return out;
}

/**
 * Sync trace ↔ top-level mirror fields (bidirectional fill gaps).
 * Mutates `observability` in place.
 */
export function applyRouteObservabilityMirror(observability: Record<string, unknown>): void {
  if (!observability) {
    return;
  }
  const traceRaw = observability.trace;
  const trace =
    traceRaw && typeof traceRaw === 'object' && !Array.isArray(traceRaw)
      ? (traceRaw as Record<string, unknown>)
      : {};
  if (!observability.trace) {
    observability.trace = trace;
  }

  for (const key of ROUTE_OBSERVABILITY_MIRROR_KEYS) {
    const top = observability[key];
    const inTrace = trace[key];
    if (top != null && inTrace == null) {
      trace[key] = top;
    } else if (inTrace != null && top == null) {
      observability[key] = inTrace;
    }
  }
}
