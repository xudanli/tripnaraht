import { resolveGatewayRoutePolicy } from './request-router.facade';
import type { RouteClassForkV1 } from './route-and-run-route-class-fork.util';
import { signalsFromRequest } from '../utils/orchestration-signals.util';

describe('resolveGatewayRoutePolicy (L1)', () => {
  const prevClaude = process.env.USE_CLAUDE_ORCHESTRATION;
  const prevSm = process.env.USE_STATE_MACHINE_ORCHESTRATION;

  afterEach(() => {
    if (prevClaude === undefined) delete process.env.USE_CLAUDE_ORCHESTRATION;
    else process.env.USE_CLAUDE_ORCHESTRATION = prevClaude;
    if (prevSm === undefined) delete process.env.USE_STATE_MACHINE_ORCHESTRATION;
    else process.env.USE_STATE_MACHINE_ORCHESTRATION = prevSm;
  });

  it('selects CLAUDE_SM when flags + structured trip signals agree', () => {
    process.env.USE_CLAUDE_ORCHESTRATION = 'true';
    process.env.USE_STATE_MACHINE_ORCHESTRATION = 'true';
    const signals = signalsFromRequest({
      request_id: 'r1',
      user_id: 'u1',
      message: '帮我规划冰岛7日自驾',
      options: {
        use_claude_orchestration: true,
        use_state_machine_orchestration: true,
        intent_mode: 'TRIP_PLANNING',
      },
    });
    const decision = resolveGatewayRoutePolicy({
      env: process.env,
      options: {
        use_claude_orchestration: true,
        use_state_machine_orchestration: true,
        intent_mode: 'TRIP_PLANNING',
      },
      signals,
    });
    expect(decision.mode).toBe('CLAUDE_SM');
    expect(decision.matchedRules.length).toBeGreaterThan(0);
  });

  it('applies route_class_fork LIGHT_LOOKUP override after routePolicy', () => {
    process.env.USE_CLAUDE_ORCHESTRATION = 'true';
    process.env.USE_STATE_MACHINE_ORCHESTRATION = 'true';
    const signals = signalsFromRequest({
      request_id: 'r2',
      user_id: 'u1',
      message: '第三天天气如何',
      options: {
        use_claude_orchestration: true,
        use_state_machine_orchestration: true,
        intent_mode: 'TRIP_PLANNING',
      },
    });
    const fork: RouteClassForkV1 = {
      schemaId: 'tripnara.route_class_fork@v1',
      version: 1,
      enabled: true,
      routeClass: 'QUICK_ANSWER',
      matchedRule: 'test',
      orchestrationDepth: 'LIGHT_LOOKUP',
      deepResearchV71: 'OFF',
      asyncEligible: false,
      forkActions: [],
    };
    const decision = resolveGatewayRoutePolicy({
      env: process.env,
      options: {
        use_claude_orchestration: true,
        use_state_machine_orchestration: true,
        intent_mode: 'TRIP_PLANNING',
      },
      signals,
      routeClassFork: fork,
    });
    expect(decision.mode).toBe('CLAUDE_DYNAMIC');
    expect(decision.matchedRules.some((r) => r.includes('route_class_fork'))).toBe(true);
  });
});
