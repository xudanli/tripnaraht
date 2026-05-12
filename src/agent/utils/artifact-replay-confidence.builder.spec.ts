import {
  computeArtifactReplayConfidence,
  sumAnomalyPenalty,
  timeDecayFactorFromProvenance,
} from './artifact-replay-confidence.builder';

describe('artifact-replay-confidence.builder', () => {
  it('FULL eligibility + fresh provenance → HIGH band', () => {
    const r = computeArtifactReplayConfidence({
      replayEligibility: 'FULL',
      provenance: { generatedAt: Date.now() },
    });
    expect(r.score).toBeGreaterThan(0.85);
    expect(r.band).toBe('HIGH');
    expect(r.factors.eligibilityPrior).toBe(1);
    expect(r.factors.anomalyPenalty).toBe(0);
  });

  it('NON_REPLAYABLE → INVALID band regardless of decay', () => {
    const r = computeArtifactReplayConfidence({
      replayEligibility: 'NON_REPLAYABLE',
      provenance: { generatedAt: Date.now() },
    });
    expect(r.band).toBe('INVALID');
    expect(r.score).toBeLessThan(0.2);
  });

  it('ERROR anomalies reduce score', () => {
    const clean = computeArtifactReplayConfidence({
      replayEligibility: 'FULL',
      provenance: { generatedAt: Date.now() },
    });
    const dirty = computeArtifactReplayConfidence({
      replayEligibility: 'FULL',
      provenance: { generatedAt: Date.now() },
      runtimeExecutionAnomalies: [
        {
          code: 'X',
          severity: 'ERROR',
          category: 'IMPOSSIBLE_STATE',
          message: 'm',
        },
      ],
    });
    expect(dirty.score).toBeLessThan(clean.score);
    expect(dirty.factors.anomalyPenalty).toBeGreaterThan(0);
  });

  it('sumAnomalyPenalty caps', () => {
    const many = Array.from({ length: 20 }, (_, i) => ({
      code: `E${i}`,
      severity: 'ERROR' as const,
      category: 'IMPOSSIBLE_STATE' as const,
      message: 'x',
    }));
    expect(sumAnomalyPenalty(many)).toBe(0.65);
  });

  it('timeDecayFactor decays with age', () => {
    const now = 1_000_000;
    const fresh = timeDecayFactorFromProvenance(now - 1000, now);
    const stale = timeDecayFactorFromProvenance(now - 8 * 60 * 60 * 1000, now);
    expect(fresh.factor).toBeGreaterThan(stale.factor);
  });
});
