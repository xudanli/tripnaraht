import {
  analyzeRouteClassDrift,
  inferProductionRouteClassProxy,
  routeClassDepth,
} from './route-and-run-route-class-projection.util';
import { classifyRouteAndRunRouteClass } from './route-and-run-route-class.util';
import { ROUTE_AND_RUN_GOLDEN_EVAL_FIXTURES } from './route-and-run-golden-eval-fixtures';
import { signalsFromRequest } from '../utils/orchestration-signals.util';
import { routePolicy } from '../utils/orchestration-policy.util';

describe('route-and-run-route-class-projection.util', () => {
  it('detects OVER_DEPTH when production heavier than protocol', () => {
    expect(analyzeRouteClassDrift('QUICK_ANSWER', 'FULL_DEEP_PLAN')).toBe('OVER_DEPTH');
    expect(routeClassDepth('QUICK_ANSWER')).toBeLessThan(routeClassDepth('FULL_DEEP_PLAN'));
  });

  it('detects UNDER_DEPTH when production lighter than protocol', () => {
    expect(analyzeRouteClassDrift('FULL_DEEP_PLAN', 'QUICK_ANSWER')).toBe('UNDER_DEPTH');
  });

  it('golden fixtures: protocol self-consistency (production proxy may drift)', () => {
    let match = 0;
    for (const fx of ROUTE_AND_RUN_GOLDEN_EVAL_FIXTURES) {
      const protocol = classifyRouteAndRunRouteClass(fx.request);
      expect(protocol.routeClass).toBe(fx.expected.routeClass);
      const signals = signalsFromRequest(fx.request);
      const decision = routePolicy(process.env, fx.request.options, signals);
      const production = inferProductionRouteClassProxy(fx.request, signals, decision);
      if (protocol.routeClass === production.routeClass) {
        match += 1;
      }
    }
    expect(match).toBeGreaterThan(0);
  });
});
