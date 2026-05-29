import { evaluateShadowPromotionGates } from './shadow-promotion-gate.util';
import type { ShadowGraderAggregateMetrics } from '../interfaces/shadow-deployment.types';

function baseMetrics(
  overrides: Partial<ShadowGraderAggregateMetrics>,
): ShadowGraderAggregateMetrics {
  return {
    shadowVersion: 'shadow-test',
    sampleCount: 1000,
    shadowWinCount: 600,
    shadowWinRate: 0.6,
    productionSafetyPassRate: 0.9,
    shadowSafetyPassRate: 0.92,
    productionAvgReward: 0.7,
    shadowAvgReward: 0.75,
    promotionReady: false,
    promotionBlockers: [],
    ...overrides,
  };
}

describe('evaluateShadowPromotionGates', () => {
  it('passes when all four gates satisfied', () => {
    const r = evaluateShadowPromotionGates(baseMetrics({}), { minSamples: 1000, minWinRate: 0.52 });
    expect(r.passed).toBe(true);
  });

  it('defers when sample count insufficient', () => {
    const r = evaluateShadowPromotionGates(baseMetrics({ sampleCount: 50, shadowWinRate: 0.9 }));
    expect(r.passed).toBe(false);
    expect(r.hasEnoughSamples).toBe(false);
  });

  it('defers when shadow safety below production', () => {
    const r = evaluateShadowPromotionGates(
      baseMetrics({ shadowSafetyPassRate: 0.8, productionSafetyPassRate: 0.9 }),
    );
    expect(r.passed).toBe(false);
    expect(r.satisfiesSafetyGate).toBe(false);
  });
});
