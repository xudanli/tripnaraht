import type { DecisionExecutableAction } from '../../world-facts/decision-execution.types';
import { RouteDecisionEngineService } from './route-decision-engine.service';
import { ActionDispatcherService } from './action-dispatcher.service';

describe('ActionDispatcherService', () => {
  const engine = new RouteDecisionEngineService();
  const dispatcher = new ActionDispatcherService(engine);

  const degradeAction = (): DecisionExecutableAction => ({
    actionType: 'ROUTE_DEGRADE',
    severity: 'MEDIUM',
    reversible: true,
    rollbackHint: 'hint',
    sourceFactorIds: ['f'],
    payload: { kind: 'WEATHER_WIND', countryCode: 'IS' },
  });

  it('dispatches ROUTE_DEGRADE and returns traces', () => {
    const recs = [{ routeDirection: { id: 1 }, score: 50, reasons: [] }] as any[];
    const out = dispatcher.dispatch([degradeAction()], { recommendations: recs });

    expect(out.traces).toHaveLength(1);
    expect(out.traces[0]?.status).toBe('SUCCESS');
    expect(out.recommendations[0]?.score).toBe(44);
    expect(out.rollbackTokens).toHaveLength(1);
  });

  it('returns unchanged recommendations when no actions', () => {
    const recs = [{ routeDirection: { id: 1 }, score: 50, reasons: [] }] as any[];
    const out = dispatcher.dispatch([], { recommendations: recs });
    expect(out.traces).toHaveLength(0);
    expect(out.recommendations[0]?.score).toBe(50);
  });
});
