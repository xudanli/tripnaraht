import { readPlanCandidateMeta, buildPersonaOpinions } from './guide-plan-candidate-meta.util';

describe('guide-plan-candidate-meta.util', () => {
  it('reads canonical finalize metadata from personaOpinions', () => {
    const meta = readPlanCandidateMeta(
      buildPersonaOpinions({
        decisionEngineStatus: 'finalized',
        canonical: {
          finalized: true,
          recommended: true,
          decisionId: 'dec_abc',
          overallStatus: 'UNVERIFIED',
        },
      }),
    );

    expect(meta).toEqual({
      decisionEngineStatus: 'finalized',
      finalized: true,
      canonicalRecommended: true,
      canonicalDecisionId: 'dec_abc',
      canonicalOverallStatus: 'UNVERIFIED',
    });
  });

  it('defaults to unavailable when personaOpinions missing', () => {
    expect(readPlanCandidateMeta(null)).toEqual({
      decisionEngineStatus: 'unavailable',
      finalized: false,
      canonicalRecommended: false,
      canonicalDecisionId: undefined,
      canonicalOverallStatus: undefined,
    });
  });
});
