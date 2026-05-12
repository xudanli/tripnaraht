import type { TripWorldState } from '../decision/world-model';
import { buildExecutionUncertainty } from './build-execution-uncertainty';
import { buildDisturbanceModel } from './build-disturbance-model';
import { evaluateBayesianCausalUpdate } from './bayesian-causal-update';
import { evaluateProbabilisticStability } from './probabilistic-stability';
import {
  evaluateProbabilisticFixedPointSketch,
  estimateResidualVariance,
} from './probabilistic-fixed-point-sketch';
import { evaluateStochasticLyapunov, closureToLyapunovCarrier } from '../execution-stability';
import type { EcoNeptuneClosureEvaluation } from '../execution-cognitive-orchestrator/execution-cognitive-orchestrator.types';

function minimalClosure(partial: Partial<EcoNeptuneClosureEvaluation>): EcoNeptuneClosureEvaluation {
  return {
    ecoDriftScore: 0.2,
    stabilityScore: 0.85,
    semanticConvergence: 0.8,
    shouldRerunNeptune: false,
    reasons: [],
    thresholds: { driftMax: 0.35, stabilityMin: 0.7, convergenceMin: 0.6 },
    ...partial,
  };
}

describe('P-ECO-Closure-6 probabilistic dynamics', () => {
  it('buildExecutionUncertainty returns bounded aggregates', () => {
    const state = {
      signals: {
        physicsFieldIndex: undefined,
        executionOverlayFrames: [],
        reflectiveCausalModel: undefined,
      },
    } as unknown as TripWorldState;
    const u = buildExecutionUncertainty(state);
    expect(u.variance).toBeGreaterThanOrEqual(0);
    expect(u.variance).toBeLessThanOrEqual(1);
    expect(u.confidence).toBeGreaterThanOrEqual(0);
    expect(u.confidence).toBeLessThanOrEqual(1);
  });

  it('evaluateStochasticLyapunov marks decrease when energy drops', () => {
    const hi = minimalClosure({ ecoDriftScore: 0.5 });
    const lo = minimalClosure({ ecoDriftScore: 0.1 });
    const d = buildDisturbanceModel({ signals: {} } as TripWorldState);
    const out = evaluateStochasticLyapunov(
      closureToLyapunovCarrier(hi, 0),
      closureToLyapunovCarrier(lo, 0),
      d,
    );
    expect(out.expectedEnergyDecreasing).toBe(true);
    expect(out.expectedNextEnergy).toBeLessThan(out.expectedPrevEnergy);
  });

  it('evaluateProbabilisticStability uses Gaussian tail', () => {
    const cert = evaluateProbabilisticStability({
      meanEnergy: 0.01,
      energyVariance: 0.01,
      epsilon: 0.18,
      tau: 0.95,
    });
    expect(cert.probabilityBelowEpsilon).toBeGreaterThan(0.95);
    expect(cert.probabilisticallyStable).toBe(true);
  });

  it('evaluateProbabilisticFixedPointSketch respects residual vs epsilon', () => {
    const sketch = evaluateProbabilisticFixedPointSketch({
      residualDelta: 0.02,
      epsilonResidual: 0.06,
      residualVariance: 0.001,
      tau: 0.5,
    });
    expect(sketch.highProbabilityConvergent).toBe(true);
  });

  it('estimateResidualVariance combines uncertainty and disturbance', () => {
    const r = estimateResidualVariance(
      { entropy: 0.2, variance: 0.3, confidence: 0.7, uncertaintySources: [] },
      { weatherNoise: 0.1, routeNoise: 0.1, temporalNoise: 0.1, userDeviationNoise: 0.1 },
    );
    expect(r).toBeGreaterThan(0);
    expect(r).toBeLessThanOrEqual(1);
  });

  it('evaluateBayesianCausalUpdate yields posteriors for edges', () => {
    const out = evaluateBayesianCausalUpdate({
      nodes: [],
      edges: [{ from: 'a', to: 'b', relation: 'CAUSES', weight: 0.7 }],
      meta: { confidence: 0.9, origin: 'OBSERVED' },
    });
    expect(out.edges).toHaveLength(1);
    expect(out.edges[0]!.edgeId).toBe('a->b');
  });
});
