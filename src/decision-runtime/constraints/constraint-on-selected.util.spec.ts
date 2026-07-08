import {
  detectConstraintScenarioIds,
  parseConstraintGatewayOnScenarios,
  shouldUseCanonicalConstraintAuthority,
} from './constraint-on-selected.util';

describe('constraint-on-selected.util', () => {
  it('detects iceland road closed from packContext', () => {
    expect(
      detectConstraintScenarioIds({
        packContext: {
          country: 'IS',
          semanticKey: 'ROAD_SEGMENT_UNAVAILABLE',
          facts: { road: { status: 'CLOSED' } },
          candidateUsesRoute: true,
        },
      }),
    ).toContain('iceland-road-closed');
  });

  it('detects opening hours conflict from signals', () => {
    expect(
      detectConstraintScenarioIds({
        signals: { openingHoursConflict: true },
      }),
    ).toContain('opening-hours-conflict');
  });

  it('shouldUseCanonicalConstraintAuthority when scenario enabled', () => {
    expect(
      shouldUseCanonicalConstraintAuthority(
        ['weather-outdoor-storm'],
        ['weather-outdoor-storm', 'iceland-road-closed'],
      ),
    ).toBe(true);
    expect(
      shouldUseCanonicalConstraintAuthority(
        ['opening-hours-conflict'],
        ['weather-outdoor-storm'],
      ),
    ).toBe(false);
  });

  it('detects ontology insurance/entry from constraint codes', () => {
    expect(
      detectConstraintScenarioIds({
        signals: { ontologyConstraintCodes: ['ENTRY_ELIGIBILITY_UNKNOWN'] },
      }),
    ).toContain('iceland-ontology-insurance-entry');
  });

  it('parseConstraintGatewayOnScenarios from env', () => {
    const prev = process.env.CONSTRAINT_GATEWAY_ON_SCENARIOS;
    process.env.CONSTRAINT_GATEWAY_ON_SCENARIOS =
      'iceland-road-closed, weather-outdoor-storm';
    expect(parseConstraintGatewayOnScenarios()).toEqual([
      'iceland-road-closed',
      'weather-outdoor-storm',
    ]);
    if (prev === undefined) delete process.env.CONSTRAINT_GATEWAY_ON_SCENARIOS;
    else process.env.CONSTRAINT_GATEWAY_ON_SCENARIOS = prev;
  });
});
