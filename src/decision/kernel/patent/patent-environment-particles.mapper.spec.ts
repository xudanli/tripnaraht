import type { DecisionState } from '../decision-state.types';
import {
  attachPatentParticlesViewToEnvironment,
  mapDsoToPatentEnvironmentParticles,
  PATENT_PARTICLES_VIEW_KEY,
} from './patent-environment-particles.mapper';

describe('mapDsoToPatentEnvironmentParticles', () => {
  const nzDso = (): DecisionState =>
    ({
      userIntent: { budget: 20000, destination: 'NZ' },
      environmentState: {
        weatherRisk: 0.9,
        failureRiskLevel: 'HIGH',
        roadConditions: { milford_closure_prob: 0.4 },
      },
      beliefSamples: [
        { sampleId: 'a', weight: 0.45, environmentSummary: { weatherRisk: 0.9 } },
        { sampleId: 'b', weight: 0.4, environmentSummary: { weatherRisk: 0.9 } },
        { sampleId: 'c', weight: 0.1, environmentSummary: { weatherRisk: 0.35 } },
      ],
      systemState: { requestId: 'nz-5d', version: 2 },
    }) as DecisionState;

  it('projects beliefSamples into patent particles with normalized weights', () => {
    const view = mapDsoToPatentEnvironmentParticles(nzDso());
    expect(view.particles.length).toBe(3);
    expect(view.weights.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 5);
    expect(view.summary.weather_forecast?.day3_risk).toBeCloseTo(0.9, 2);
    expect(view.summary.road_conditions?.milford_closure_prob).toBeCloseTo(0.4, 2);
  });

  it('uses 暴风雨 label when day3 weather risk >= 0.7', () => {
    const view = mapDsoToPatentEnvironmentParticles(nzDso());
    expect(view.particles[0]?.weather_day3).toBe('暴风雨');
  });

  it('falls back to single uniform particle when beliefSamples empty', () => {
    const dso = nzDso();
    dso.beliefSamples = [];
    const view = mapDsoToPatentEnvironmentParticles(dso);
    expect(view.particles.length).toBe(1);
    expect(view.weights[0]).toBeCloseTo(1, 5);
  });

  it('attachPatentParticlesViewToEnvironment writes patentParticlesView key', () => {
    const view = mapDsoToPatentEnvironmentParticles(nzDso());
    const env = attachPatentParticlesViewToEnvironment({}, view);
    expect((env as any)[PATENT_PARTICLES_VIEW_KEY]).toEqual(view);
  });
});
