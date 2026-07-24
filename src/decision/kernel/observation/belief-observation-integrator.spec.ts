import { integratePassabilityIntoBeliefSamples } from './belief-observation-integrator';

describe('belief-observation-integrator', () => {
  it('blends passability toward observation weighted by evidence', () => {
    const samples = Array.from({ length: 5 }, (_, i) => ({
      sampleId: `s${i}`,
      environmentSummary: { weatherRisk: 0.9, passability: 0.8 },
      weight: 0.2,
    }));
    const out = integratePassabilityIntoBeliefSamples(samples, { passability01: 0.2, evidenceWeight: 0.9 });
    expect(out[0].environmentSummary?.passability).toBeCloseTo(0.26, 2);
  });
});
