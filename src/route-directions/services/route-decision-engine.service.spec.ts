import type { DecisionExecutableAction } from '../../world-facts/decision-execution.types';
import { RouteDecisionEngineService } from './route-decision-engine.service';

describe('RouteDecisionEngineService', () => {
  const engine = new RouteDecisionEngineService();

  const action = (overrides: Partial<DecisionExecutableAction> = {}): DecisionExecutableAction => ({
    actionType: 'ROUTE_DEGRADE',
    severity: 'MEDIUM',
    reversible: true,
    rollbackHint: 'x',
    sourceFactorIds: ['f1'],
    payload: { kind: 'WEATHER_WIND', countryCode: 'IS', assert: 'wind>thr' },
    ...overrides,
  });

  it('degrades score for matching routeDirection id', () => {
    const recs = [
      {
        routeDirection: { id: 7 },
        score: 100,
        reasons: [],
      },
      {
        routeDirection: { id: 8 },
        score: 90,
        reasons: [],
      },
    ] as any[];

    const { adjusted, rollbackToken } = engine.applyRouteDegrade(
      recs,
      action({ payload: { kind: 'WEATHER_WIND', routeDirectionId: '7' } }),
    );

    expect(adjusted.find((r: any) => r.routeDirection.id === 7)?.score).toBe(88);
    expect(adjusted.find((r: any) => r.routeDirection.id === 8)?.score).toBe(90);

    const restored = engine.rollbackRecommendations(rollbackToken);
    expect(restored?.[0]?.score).toBe(100);
  });

  it('rollback invalid token returns null', () => {
    expect(engine.rollbackRecommendations('nope')).toBeNull();
  });
});
