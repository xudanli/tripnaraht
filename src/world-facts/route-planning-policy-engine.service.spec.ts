import type { ExecutionPlanningContext } from './execution-planning-context.types';
import { DEFAULT_ROUTE_PLANNING_POLICY_PARAMETERS } from './route-planning-policy.defaults';
import { RoutePlanningPolicyEngineService } from './route-planning-policy-engine.service';

describe('RoutePlanningPolicyEngineService', () => {
  const mockConfig = {
    getActiveParameters: jest.fn().mockReturnValue({
      params: { ...DEFAULT_ROUTE_PLANNING_POLICY_PARAMETERS },
      revision: DEFAULT_ROUTE_PLANNING_POLICY_PARAMETERS.revision,
      sources: ['default'],
    }),
  };

  const engine = new RoutePlanningPolicyEngineService(mockConfig as any);

  const ctx = (partial: Partial<ExecutionPlanningContext>): ExecutionPlanningContext =>
    ({
      countryCode: 'IS',
      tripExecutionHistory: [],
      hints: {
        routeDegradeCountByRouteDirectionId: {},
        ambientDegradeEvents: 0,
      },
      ...partial,
    }) as ExecutionPlanningContext;

  it('passes through when no planning context', () => {
    const out = engine.apply(80, 1, null);
    expect(out.score).toBe(80);
    expect(out.excluded).toBe(false);
    expect(out.appliedRuleIds).toHaveLength(0);
    expect(out.trace.some((t) => t.ruleId === 'POLICY_CONFIG_ACTIVE_REVISION')).toBe(true);
    expect(out.policyRevision).toBeTruthy();
  });

  it('evaluateOverrides includes revision and respects bypass only when memory signals', () => {
    const empty = engine.evaluateOverrides(null);
    expect(empty.bypassSelectionCache).toBe(false);
    expect(empty.policyRevision).toBeTruthy();

    const noBypass = engine.evaluateOverrides(
      ctx({ tripId: undefined, tripExecutionHistory: [], lastCountryDispatchFact: undefined }),
    );
    expect(noBypass.bypassSelectionCache).toBe(false);
    expect(noBypass.trace[0]?.ruleId).toBe('POLICY_CONFIG_ACTIVE_REVISION');

    const bypass = engine.evaluateOverrides(ctx({ tripId: 't1' }));
    expect(bypass.bypassSelectionCache).toBe(true);
    expect(bypass.policyConfigSources).toContain('default');
  });

  it('excludes when degrade count extreme', () => {
    const out = engine.apply(
      90,
      7,
      ctx({
        hints: {
          routeDegradeCountByRouteDirectionId: { '7': 8 },
          ambientDegradeEvents: 0,
        },
      }),
    );
    expect(out.excluded).toBe(true);
    expect(out.appliedRuleIds).toContain('POLICY_EXCLUDE_EXTREME_REPEATED_ROUTE_DEGRADE');
  });

  it('applies hard penalty when degrade count > 3', () => {
    const out = engine.apply(
      100,
      7,
      ctx({
        hints: {
          routeDegradeCountByRouteDirectionId: { '7': 4 },
          ambientDegradeEvents: 0,
        },
      }),
    );
    expect(out.excluded).toBe(false);
    expect(out.appliedRuleIds).toContain('POLICY_HARD_PENALTY_AFTER_THREE_DEGRADES');
    expect(out.score).toBeLessThan(40);
  });
});
