import {
  buildExplanationFromContext,
  synthesizeExplanation,
} from './explanation.synthesizer';

describe('synthesizeExplanation', () => {
  it('returns empty-graph summary when no nodes', () => {
    const out = synthesizeExplanation({ nodes: [] });
    expect(out.steps.length).toBe(0);
    expect(out.summary).toContain('No causal trace');
  });

  it('buildExplanationFromContext produces steps and causalChain', () => {
    const expl = buildExplanationFromContext({
      nowMs: 1,
      constraintDiffs: [
        {
          source: 'WEATHER',
          affectedSlots: ['s2'],
          reasonCode: 'HIGH_WIND',
        },
      ],
    });
    expect(expl.steps.length).toBeGreaterThan(0);
    expect(expl.causalChain).toEqual(expl.steps);
    expect(expl.summary).toContain('real-world');
  });
});
