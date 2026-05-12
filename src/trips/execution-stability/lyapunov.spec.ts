import {
  closureToLyapunovCarrier,
  computeLyapunovEnergy,
  evaluateLyapunov,
} from './evaluate-lyapunov';
import { evaluateLyapunovDivergence } from './lyapunov-divergence';
import { isInStabilityRegion } from './stability-region';
import type { EcoNeptuneClosureEvaluation } from '../execution-cognitive-orchestrator/execution-cognitive-orchestrator.types';

function closure(p: Partial<EcoNeptuneClosureEvaluation>): EcoNeptuneClosureEvaluation {
  return {
    ecoDriftScore: 0.3,
    stabilityScore: 0.8,
    semanticConvergence: 0.75,
    shouldRerunNeptune: false,
    reasons: [],
    thresholds: { driftMax: 0.35, stabilityMin: 0.7, convergenceMin: 0.6 },
    ...p,
  };
}

describe('Lyapunov stability layer', () => {
  it('evaluateLyapunov decreases when instability drains', () => {
    const hi = closure({ ecoDriftScore: 0.8, stabilityScore: 0.4, semanticConvergence: 0.4 });
    const lo = closure({ ecoDriftScore: 0.15, stabilityScore: 0.9, semanticConvergence: 0.85 });
    const out = evaluateLyapunov(closureToLyapunovCarrier(hi, 0), closureToLyapunovCarrier(lo, 0));
    expect(out.decreasing).toBe(true);
    expect(out.delta).toBeLessThan(0);
  });

  it('evaluateLyapunovDivergence trips on rising energy + anti-contractive + budget', () => {
    expect(
      evaluateLyapunovDivergence({
        energyDelta: 0.05,
        contractionRate: -1,
        iterationIndex: 2,
        maxIter: 2,
      }),
    ).toBe('DIVERGENT');
    expect(
      evaluateLyapunovDivergence({
        energyDelta: -0.01,
        contractionRate: 1,
        iterationIndex: 2,
        maxIter: 2,
      }),
    ).toBe('OK');
  });

  it('isInStabilityRegion respects ε and η', () => {
    expect(
      isInStabilityRegion({
        lyapunovValue: 0.1,
        residualDelta: 0.03,
        contractionRate: 1,
      }).inRegion,
    ).toBe(true);
    expect(
      isInStabilityRegion({
        lyapunovValue: 0.5,
        residualDelta: 0.03,
        contractionRate: 1,
      }).inRegion,
    ).toBe(false);
  });

  it('patchMagnitude raises energy', () => {
    const c = closure({});
    const low = computeLyapunovEnergy(closureToLyapunovCarrier(c, 0));
    const high = computeLyapunovEnergy(closureToLyapunovCarrier(c, 1));
    expect(high).toBeGreaterThanOrEqual(low);
  });
});
