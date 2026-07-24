import {
  applyRouteObservabilityMirror,
  buildRouteObservabilityRoutingEcho,
} from './mirror-route-and-run-observability.util';
import type { RouteClassForkV1 } from './route-and-run-route-class-fork.util';

const fork: RouteClassForkV1 = {
  schemaId: 'tripnara.route_class_fork@v1',
  version: 1,
  enabled: true,
  routeClass: 'QUICK_ANSWER',
  matchedRule: 'consultation_quick',
  orchestrationDepth: 'LIGHT_LOOKUP',
  deepResearchV71: 'OFF',
  asyncEligible: false,
  forkActions: ['intent_mode=DATA_LOOKUP'],
};

describe('mirror-route-and-run-observability.util', () => {
  it('buildRouteObservabilityRoutingEcho packs fork', () => {
    const echo = buildRouteObservabilityRoutingEcho({ routeClassFork: fork });
    expect(echo.route_class_fork_v1).toEqual(fork);
  });

  it('applyRouteObservabilityMirror copies trace → top-level', () => {
    const obs: Record<string, unknown> = {
      latency_ms: 10,
      trace: { route_class_fork_v1: fork, timestamp: 't' },
    };
    applyRouteObservabilityMirror(obs);
    expect(obs.route_class_fork_v1).toEqual(fork);
    expect((obs.trace as Record<string, unknown>).route_class_fork_v1).toEqual(fork);
  });

  it('applyRouteObservabilityMirror copies top-level → trace', () => {
    const obs: Record<string, unknown> = {
      route_class_fork_v1: fork,
    };
    applyRouteObservabilityMirror(obs);
    expect((obs.trace as Record<string, unknown>).route_class_fork_v1).toEqual(fork);
  });
});
