import {
  enrichGuardianPresentation,
  resolveHardConstraintBlocked,
} from './guardian-presentation.util';

describe('guardian-presentation.util', () => {
  const base = {
    mode: 'single_lead' as const,
    scenario: 'SAFETY_WARN' as const,
    leadSpeaker: 'ABU' as const,
    headline: 'Abu 发现风险',
    narrative: 'test',
    expressionPhase: 'planning' as const,
    displayStyle: 'design_advisory' as const,
    supportingLines: [],
    actions: {},
    structuredStatus: {},
  };

  it('detects BLOCK from actions.abu', () => {
    expect(
      resolveHardConstraintBlocked({ ...base, actions: { abu: 'BLOCK' }, structuredStatus: {}, scenario: 'SAFETY_WARN' }),
    ).toBe(true);
  });

  it('detects BLOCK from scenario SAFETY_BLOCK', () => {
    expect(
      resolveHardConstraintBlocked({ ...base, scenario: 'SAFETY_BLOCK', actions: {}, structuredStatus: {} }),
    ).toBe(true);
  });

  it('enriches hardConstraintBlocked on presentation', () => {
    const enriched = enrichGuardianPresentation({
      ...base,
      scenario: 'SAFETY_BLOCK',
      actions: { abu: 'BLOCK' },
      structuredStatus: { abu: { existence: 'BLOCK', action: 'BLOCK' } },
    });
    expect(enriched.hardConstraintBlocked).toBe(true);
  });
});
