import type { EcoNeptuneClosureEvaluation } from '../execution-cognitive-orchestrator/execution-cognitive-orchestrator.types';
import { buildConvergenceProofSketch } from './convergence-proof-sketch';
import { detectResidualDivergence } from './divergence-detector';

function mk(p: Partial<EcoNeptuneClosureEvaluation>): EcoNeptuneClosureEvaluation {
  return {
    ecoDriftScore: 0.2,
    stabilityScore: 0.85,
    semanticConvergence: 0.75,
    shouldRerunNeptune: false,
    reasons: [],
    thresholds: { driftMax: 0.35, stabilityMin: 0.7, convergenceMin: 0.6 },
    ...p,
  };
}

describe('P-ECO-Closure-4 convergence proof sketch', () => {
  it('detectResidualDivergence flags strict increase', () => {
    expect(detectResidualDivergence([0.1, 0.2, 0.35]).divergent).toBe(true);
    expect(detectResidualDivergence([0.3, 0.2]).divergent).toBe(false);
  });

  it('buildConvergenceProofSketch aggregates Lyapunov + monotonicity', () => {
    const a = mk({ ecoDriftScore: 0.5, stabilityScore: 0.5, semanticConvergence: 0.5 });
    const b = mk({ ecoDriftScore: 0.2, stabilityScore: 0.85, semanticConvergence: 0.75 });
    const s = buildConvergenceProofSketch([a, b], [0.4, 0.1], 2);
    expect(s.lyapunovNonIncreasing).toBe(true);
    expect(s.monotonicResiduals).toBe(true);
    expect(s.divergent).toBe(false);
  });
});
