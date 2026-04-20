import { memoryToBeliefPrior } from './memory-to-belief.adapter';

describe('memoryToBeliefPrior', () => {
  it('returns empty when confidence is 0', () => {
    const out = memoryToBeliefPrior({
      dso: { environmentState: { weatherRisk: 0.4 } } as any,
      memory: { confidence01: 0 },
      n: 40,
    });
    expect(out.beliefSamples).toHaveLength(0);
    expect(out.priorAudit.sampleCount).toBe(0);
  });

  it('creates a center-heavy distribution when confidence high', () => {
    const out = memoryToBeliefPrior({
      dso: { environmentState: { weatherRisk: 0.4 } } as any,
      memory: { confidence01: 0.9, envOverrides: { crowdLevel: 0.2 } },
      n: 10,
    });
    expect(out.beliefSamples).toHaveLength(10);
    expect(out.beliefSamples[0].weight).toBeGreaterThan(0.7);
    expect(out.beliefSamples[0].environmentSummary?.crowdLevel).toBe(0.2);
  });
});

