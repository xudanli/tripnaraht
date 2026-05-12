import type { TripWorldState } from '../decision/world-model';
import type { P7EcoClosureAugmentation } from '../meta-dynamics/build-p7-eco-closure';
import { buildSemanticTrustCore } from './semantic-trust-core';
import { evaluateRecursiveBoundary, DEFAULT_REFLECTIVE_MAX_DEPTH } from './recursive-boundary';
import { buildP8EcoClosureAugmentation } from './build-p8-eco-closure';

describe('P-ECO-Closure-8 recursive semantics', () => {
  const state = {
    context: {
      destination: 'is',
      startDate: '2026-06-01',
      durationDays: 5,
      preferences: { intents: {}, pace: 'moderate', riskTolerance: 'low' },
    },
    policies: {},
    signals: { reflectiveCausalModel: undefined, physicsFieldIndex: undefined },
  } as unknown as TripWorldState;

  const p7Stub: P7EcoClosureAugmentation = {
    metaExecutionState: {
      convergencePolicy: 'res:0.06|man:0.08|fp:0',
      patchStrategy: 'full_neptune_retry',
      causalUpdatePolicy: 'none',
      proofSemantics: 'p6_prob+p5_contract|driftRef:0.35',
      adaptationRate: 0.2,
    },
    adaptiveLyapunov: {
      energyFunction: 'V_t',
      adaptationHistory: [{ stepIndex: 0, note: 'eco_closure_single_pass' }],
      stabilityRetentionScore: 0.8,
    },
    metaReflection: {
      policyDrift: 0.1,
      convergenceRuleChange: 0.05,
      semanticMutation: 0.2,
      causalTopologyMutation: 0.1,
    },
    executionIdentity: {
      semanticCoreHash: 'a'.repeat(32),
      invariantCore: ['trip_context'],
      mutationEnvelope: 0.35,
    },
    metaStabilityGuard: {
      freezePolicyEvolution: false,
      reasons: [],
      adaptationRateLimit: 0.55,
      convergencePolicyMutationLimit: 0.4,
    },
  };

  it('buildSemanticTrustCore marks incompleteness', () => {
    const t = buildSemanticTrustCore();
    expect(t.incompletenessAcknowledged).toBe(true);
    expect(t.axiomaticTags.length).toBeGreaterThan(0);
  });

  it('recursive boundary freezes beyond max depth', () => {
    const b = evaluateRecursiveBoundary({
      reflectiveDepth: DEFAULT_REFLECTIVE_MAX_DEPTH + 3,
      selfReferenceRisk: 0.1,
    });
    expect(b.freezeReflection).toBe(true);
  });

  it('buildP8EcoClosureAugmentation returns full stack', () => {
    const p8 = buildP8EcoClosureAugmentation({
      state,
      p7: p7Stub,
      executionUncertainty: {
        entropy: 0.2,
        variance: 0.15,
        confidence: 0.75,
        uncertaintySources: ['physics_envelope'],
      },
      probabilisticStability: {
        probabilityBelowEpsilon: 0.9,
        epsilon: 0.18,
        tau: 0.95,
        probabilisticallyStable: true,
      },
      bayesianObservationLikelihood: 0.85,
    });
    expect(p8.selfModel.semanticIdentity).toHaveLength(32);
    expect(p8.recursiveReasoning.reasoningDepth).toBeGreaterThanOrEqual(1);
    expect(p8.neptuneReflectiveSemantics.reasoningConfidence).toBeGreaterThanOrEqual(0);
    expect(p8.neptuneReflectiveSemantics.reasoningConfidence).toBeLessThanOrEqual(1);
    expect(p8.computationalIdentity.coreAxioms.length).toBeGreaterThan(0);
  });
});
