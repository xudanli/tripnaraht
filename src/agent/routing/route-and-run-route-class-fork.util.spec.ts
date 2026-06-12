import { ROUTE_AND_RUN_GOLDEN_EVAL_FIXTURES } from './route-and-run-golden-eval-fixtures';
import {
  applyRouteClassForkInPlace,
  applyRouteClassForkPolicyOverrides,
  isRouteClassForkEnabled,
} from './route-and-run-route-class-fork.util';
import type { OrchestrationPolicyDecision } from '../utils/orchestration-policy.util';
import { routePolicy } from '../utils/orchestration-policy.util';
import { signalsFromRequest } from '../utils/orchestration-signals.util';

function makeDecision(mode: OrchestrationPolicyDecision['mode']): OrchestrationPolicyDecision {
  const signals = signalsFromRequest({
    request_id: 't',
    user_id: 'u',
    message: 'test',
  });
  return {
    mode,
    reason: 'test',
    matchedRules: [],
    signals,
    flags: {
      env_USE_CLAUDE_ORCHESTRATION: true,
      opt_use_claude_orchestration: true,
      opt_use_state_machine_orchestration: true,
      derived_use_state_machine_orchestration: true,
    },
  };
}

describe('route-and-run-route-class-fork.util', () => {
  const prevFork = process.env.ROUTE_CLASS_FORK;

  afterEach(() => {
    if (prevFork === undefined) {
      delete process.env.ROUTE_CLASS_FORK;
    } else {
      process.env.ROUTE_CLASS_FORK = prevFork;
    }
  });

  it('is enabled by default', () => {
    delete process.env.ROUTE_CLASS_FORK;
    expect(isRouteClassForkEnabled()).toBe(true);
  });

  describe('golden fork actions', () => {
    beforeEach(() => {
      process.env.ROUTE_CLASS_FORK = '1';
    });

    it('QUICK_ANSWER → DATA_LOOKUP + skip SM', () => {
      const fx = ROUTE_AND_RUN_GOLDEN_EVAL_FIXTURES.find((f) => f.id === 'golden-quick-day3-hike-feasibility')!;
      const req = structuredClone(fx.request);
      const fork = applyRouteClassForkInPlace(req);
      expect(fork?.routeClass).toBe('QUICK_ANSWER');
      expect(req.options?.intent_mode).toBe('DATA_LOOKUP');
      expect(req.options?.use_state_machine_orchestration).toBe(false);
    });

    it('FULL_DEEP_PLAN → TRIP_PLANNING + SM', () => {
      const fx = ROUTE_AND_RUN_GOLDEN_EVAL_FIXTURES.find((f) => f.id === 'golden-full-tokyo-5d-family')!;
      const req = structuredClone(fx.request);
      const fork = applyRouteClassForkInPlace(req);
      expect(fork?.routeClass).toBe('FULL_DEEP_PLAN');
      expect(req.options?.intent_mode).toBe('TRIP_PLANNING');
      expect(req.options?.use_state_machine_orchestration).toBe(true);
    });

    it('CRUD_EDIT → force SM for intake', () => {
      const fx = ROUTE_AND_RUN_GOLDEN_EVAL_FIXTURES.find((f) => f.id === 'golden-crud-delete-blue-lagoon')!;
      const req = structuredClone(fx.request);
      const fork = applyRouteClassForkInPlace(req);
      expect(fork?.routeClass).toBe('CRUD_EDIT');
      expect(req.options?.use_state_machine_orchestration).toBe(true);
    });

    it('does not override explicit intent_mode', () => {
      const fx = ROUTE_AND_RUN_GOLDEN_EVAL_FIXTURES.find((f) => f.id === 'golden-quick-day3-hike-feasibility')!;
      const req = structuredClone(fx.request);
      req.options = { ...req.options, intent_mode: 'TRIP_PLANNING' };
      expect(applyRouteClassForkInPlace(req)).toBeNull();
    });
  });

  describe('applyRouteClassForkPolicyOverrides', () => {
    it('downgrades SM to DYNAMIC for QUICK_ANSWER fork', () => {
      const fork = applyRouteClassForkInPlace(
        structuredClone(
          ROUTE_AND_RUN_GOLDEN_EVAL_FIXTURES.find((f) => f.id === 'golden-quick-day3-hike-feasibility')!.request,
        ),
      )!;
      const base = makeDecision('CLAUDE_SM');
      const out = applyRouteClassForkPolicyOverrides(base, fork);
      expect(out.mode).toBe('CLAUDE_DYNAMIC');
    });

    it('forces SM for FULL_DEEP_PLAN fork when policy picked DYNAMIC', () => {
      const fx = ROUTE_AND_RUN_GOLDEN_EVAL_FIXTURES.find((f) => f.id === 'golden-full-tokyo-5d-family')!;
      const req = structuredClone(fx.request);
      req.options = {
        ...req.options,
        use_claude_orchestration: true,
        use_state_machine_orchestration: false,
      };
      const fork = applyRouteClassForkInPlace(req)!;
      const signals = signalsFromRequest(req);
      const base = routePolicy(process.env, req.options, signals);
      const out = applyRouteClassForkPolicyOverrides(base, fork);
      expect(out.mode).toBe('CLAUDE_SM');
    });
  });
});
