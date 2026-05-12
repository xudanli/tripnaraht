import { explainabilityReasonToDecisionFactor } from './decision-factor.mapper';

describe('explainabilityReasonToDecisionFactor', () => {
  it('maps impact to impactLevel', () => {
    const df = explainabilityReasonToDecisionFactor({
      reasonType: 'WEATHER',
      title: 't',
      summary: 's',
      derivedFromFactIds: ['a'],
      confidence: 0.9,
      impact: 'WARNING',
    });
    expect(df.factorType).toBe('WEATHER');
    expect(df.impactLevel).toBe('WARNING');
    expect(df.effect).toBe('WARNING');
    expect(df.target).toBe('COUNTRY');
    expect(df.actionHint).toBe('DEGRADE_ROUTE');
    expect(df.derivedFromFactIds).toEqual(['a']);
  });
});
