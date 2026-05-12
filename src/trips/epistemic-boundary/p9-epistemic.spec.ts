import { evaluateConfidenceHorizon } from './confidence-horizon';
import { evaluateProofBoundary } from './proof-incompleteness';
import { listUnprovableExecutionProperties } from './godel-boundary';
import { buildP9EcoClosureAugmentation } from './build-p9-eco-closure';

describe('P-ECO-Closure-9 epistemic boundary', () => {
  it('confidence horizon saturates under high variance + low gain', () => {
    const h = evaluateConfidenceHorizon({
      uncertaintyVariance: 0.45,
      observationGainProxy: 0.02,
    });
    expect(h.confidenceSaturated).toBe(true);
  });

  it('proof boundary partitions sum to 1', () => {
    const p = evaluateProofBoundary({
      contractionProof: {
        contractive: true,
        lipschitzConstant: 0.7,
        proofConfidence: 0.8,
        boundedOscillation: true,
        monotonicPatchSequence: true,
        suggestRollback: false,
      },
      probabilisticTailMass: 0.9,
      recursiveSelfReferenceRisk: 0.2,
      causalLikelihood: 0.85,
    });
    const s = p.provable + p.empiricallySupported + p.unprovable + p.contradictory;
    expect(s).toBeCloseTo(1, 5);
  });

  it('always lists global incompleteness', () => {
    const u = listUnprovableExecutionProperties({
      executionUncertainty: {
        entropy: 0.1,
        variance: 0.05,
        confidence: 0.9,
        uncertaintySources: [],
      },
      reflectiveDepth: 2,
      causalPosteriorMeanVariance: 0.05,
    });
    expect(u.some(x => x.propertyId === 'global_internal_completeness')).toBe(true);
  });

  it('buildP9EcoClosureAugmentation wires assessment', () => {
    const p9 = buildP9EcoClosureAugmentation({
      executionUncertainty: {
        entropy: 0.4,
        variance: 0.35,
        confidence: 0.55,
        uncertaintySources: ['overlay_temporal'],
      },
      contractionProof: {
        contractive: true,
        lipschitzConstant: 0.65,
        proofConfidence: 0.7,
        boundedOscillation: true,
        monotonicPatchSequence: true,
        suggestRollback: false,
      },
      recursiveReasoning: {
        reasoningDepth: 3,
        semanticConsistency: 0.75,
        selfReferenceRisk: 0.35,
        recursiveStability: 0.6,
      },
      selfModel: {
        beliefsAboutWorld: { x: 0.5 },
        beliefsAboutBeliefs: { y: 0.55 },
        confidenceInReasoning: 0.7,
        semanticIdentity: 'abc',
        reflectiveDepth: 4,
      },
      probabilisticTailMass: 0.88,
    });
    expect(p9.epistemicAssessment.confidenceHorizon).toBeGreaterThanOrEqual(0);
    expect(p9.epistemicAssessment.confidenceHorizon).toBeLessThanOrEqual(1);
    expect(p9.godelUnprovableProperties.length).toBeGreaterThan(0);
  });
});
