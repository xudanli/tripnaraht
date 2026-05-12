import { constructLearningEcpsReward } from './learning-ecps.reward.util';

describe('learning-ecps.reward', () => {
  it('increases with replay match and reuse benefit', () => {
    const low = constructLearningEcpsReward({
      workProxy: 1,
      latencyMs: 100,
      anomalyCount: 0,
      replayOutcomeMatch: false,
      reuseArtifactBenefit: 0,
    });
    const high = constructLearningEcpsReward({
      workProxy: 1,
      latencyMs: 100,
      anomalyCount: 0,
      replayOutcomeMatch: true,
      reuseArtifactBenefit: 0.8,
    });
    expect(high).toBeGreaterThan(low);
  });

  it('penalizes latency and anomalies', () => {
    const clean = constructLearningEcpsReward({
      workProxy: 1,
      latencyMs: 10,
      anomalyCount: 0,
    });
    const dirty = constructLearningEcpsReward({
      workProxy: 1,
      latencyMs: 10_000,
      anomalyCount: 5,
    });
    expect(clean).toBeGreaterThan(dirty);
  });
});
