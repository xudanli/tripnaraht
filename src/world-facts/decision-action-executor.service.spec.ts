import { DecisionActionExecutorService } from './decision-action-executor.service';

describe('DecisionActionExecutorService', () => {
  const executor = new DecisionActionExecutorService();

  it('returns empty when no degradable WEATHER factor', () => {
    expect(executor.buildExecutableActions([])).toEqual([]);
    expect(
      executor.buildExecutableActions([
        {
          factorType: 'WEATHER',
          title: 't',
          summary: 's',
          impactLevel: 'INFO',
          derivedFromFactIds: ['x'],
          effect: 'NONE',
          target: 'COUNTRY',
          actionHint: 'NONE',
        },
      ]),
    ).toEqual([]);
  });

  it('emits ROUTE_DEGRADE for WEATHER WARNING + DEGRADE_ROUTE', () => {
    const actions = executor.buildExecutableActions(
      [
        {
          factorType: 'WEATHER',
          title: '横风',
          summary: 's',
          impactLevel: 'WARNING',
          derivedFromFactIds: ['fid'],
          confidence: 0.9,
          assert: 'aggregated_wind_mps(20) > threshold_2wd(15)',
          effect: 'WARNING',
          target: 'ROUTE',
          actionHint: 'DEGRADE_ROUTE',
        },
      ],
      { countryCode: 'IS', routeDirectionId: '7' },
    );
    expect(actions).toHaveLength(1);
    expect(actions[0]?.actionType).toBe('ROUTE_DEGRADE');
    expect(actions[0]?.payload.kind).toBe('WEATHER_WIND');
    expect(actions[0]?.payload.countryCode).toBe('IS');
    expect(actions[0]?.payload.routeDirectionId).toBe('7');
    expect(actions[0]?.sourceFactorIds).toEqual(['fid']);
    expect(actions[0]?.reversible).toBe(true);
  });
});
