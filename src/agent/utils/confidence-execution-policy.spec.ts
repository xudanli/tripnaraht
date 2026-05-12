import { resolveConfidenceExecutionDirective } from './confidence-execution-policy';

describe('confidence-execution-policy', () => {
  it('HIGH → allow dedup replay', () => {
    const d = resolveConfidenceExecutionDirective({
      score: 0.9,
      band: 'HIGH',
      factors: {
        eligibilityPrior: 1,
        anomalyPenalty: 0,
        timeDecayFactor: 1,
      },
    });
    expect(d.phase).toBe('REUSE_ARTIFACT');
    expect(d.toolDepthHint).toBe('REUSE_SKIP_TOOLS');
    expect(d.allowDedupCacheReplay).toBe(true);
  });

  it('MEDIUM → no dedup replay unless policy allows', () => {
    const d = resolveConfidenceExecutionDirective(
      {
        score: 0.45,
        band: 'MEDIUM',
        factors: {
          eligibilityPrior: 0.62,
          anomalyPenalty: 0,
          timeDecayFactor: 1,
        },
      },
      { allowMediumDedupReplay: false },
    );
    expect(d.phase).toBe('LIGHTWEIGHT_VALIDATE');
    expect(d.allowDedupCacheReplay).toBe(false);
    const d2 = resolveConfidenceExecutionDirective(
      {
        score: 0.45,
        band: 'MEDIUM',
        factors: {
          eligibilityPrior: 0.62,
          anomalyPenalty: 0,
          timeDecayFactor: 1,
        },
      },
      { allowMediumDedupReplay: true },
    );
    expect(d2.allowDedupCacheReplay).toBe(true);
  });

  it('INVALID → full recompute semantics', () => {
    const d = resolveConfidenceExecutionDirective({
      score: 0,
      band: 'INVALID',
      factors: {
        eligibilityPrior: 0.06,
        anomalyPenalty: 0,
        timeDecayFactor: 1,
      },
    });
    expect(d.phase).toBe('FULL_RECOMPUTE');
    expect(d.toolDepthHint).toBe('REORCHESTRATE');
    expect(d.allowDedupCacheReplay).toBe(false);
  });
});
