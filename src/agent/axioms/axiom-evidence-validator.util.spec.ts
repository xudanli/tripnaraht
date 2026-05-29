import {
  validateAxiomMatchResult,
  type ValidatableAxiomMatch,
} from './axiom-evidence-validator.util';

describe('axiom-evidence-validator', () => {
  const originalEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
  });

  it('throws in test env when required proof_payload fields are missing', () => {
    process.env.NODE_ENV = 'test';
    const incomplete: ValidatableAxiomMatch = {
      axiom_id: 'TERRAIN_F_ROAD_UNFIT',
      evidence: {
        match_source: 'HEURISTIC',
        metric_details: { actual: 2, limit: 4, unit: 'WD', cmp: 'GEQ', slack: -2 },
        proof_payload: { vehicle_type: '2WD' },
      },
    };
    expect(() => validateAxiomMatchResult(incomplete)).toThrow(/AxiomValidationError/);
  });

  it('passes when terrain evidence satisfies the contract', () => {
    process.env.NODE_ENV = 'test';
    const complete: ValidatableAxiomMatch = {
      axiom_id: 'TERRAIN_F_ROAD_UNFIT',
      evidence: {
        match_source: 'INTENT_SIGNAL',
        metric_details: { actual: 2, limit: 4, unit: 'WD', cmp: 'GEQ', slack: -2 },
        proof_payload: {
          vehicle_type_actual: '2WD',
          froad_signals: ['froad_2wd_compliance', 'F208'],
        },
      },
    };
    expect(() => validateAxiomMatchResult(complete)).not.toThrow();
  });
});
