import type { TripWorldState } from '../decision/world-model';
import type { P7EcoClosureAugmentation } from '../meta-dynamics/build-p7-eco-closure';
import type { P8EcoClosureAugmentation } from '../recursive-semantics/build-p8-eco-closure';
import type { P9EcoClosureAugmentation } from '../epistemic-boundary/build-p9-eco-closure';
import { evaluateMutationEnvelope } from './mutation-envelope';
import { invariantOntologyIntegrityScore } from './invariant-ontology';
import { buildP10EcoClosureAugmentation } from './build-p10-eco-closure';
import { buildSemanticTrustCore } from '../recursive-semantics/semantic-trust-core';

describe('P-ECO-Closure-10 existential identity', () => {
  const state = {
    context: {
      destination: 'is',
      startDate: '2026-07-01',
      durationDays: 4,
      preferences: { intents: {}, pace: 'moderate', riskTolerance: 'low' },
    },
    policies: {},
    signals: { reflectiveCausalModel: undefined },
  } as unknown as TripWorldState;

  const p7Stub: P7EcoClosureAugmentation = {
    metaExecutionState: {
      convergencePolicy: 'x',
      patchStrategy: 'full_neptune_retry',
      causalUpdatePolicy: 'none',
      proofSemantics: 'y',
      adaptationRate: 0.15,
    },
    adaptiveLyapunov: {
      energyFunction: 'V',
      adaptationHistory: [],
      stabilityRetentionScore: 0.8,
    },
    metaReflection: {
      policyDrift: 0.05,
      convergenceRuleChange: 0.04,
      semanticMutation: 0.06,
      causalTopologyMutation: 0.05,
    },
    executionIdentity: {
      semanticCoreHash: 'b'.repeat(32),
      invariantCore: ['trip_context'],
      mutationEnvelope: 0.5,
    },
    metaStabilityGuard: {
      freezePolicyEvolution: false,
      reasons: [],
      adaptationRateLimit: 0.55,
      convergencePolicyMutationLimit: 0.4,
    },
  };

  const trust = buildSemanticTrustCore();
  const p8Stub: P8EcoClosureAugmentation = {
    selfModel: {
      beliefsAboutWorld: {},
      beliefsAboutBeliefs: {},
      confidenceInReasoning: 0.8,
      semanticIdentity: 'id',
      reflectiveDepth: 2,
    },
    recursiveReasoning: {
      reasoningDepth: 2,
      semanticConsistency: 0.9,
      selfReferenceRisk: 0.1,
      recursiveStability: 0.85,
    },
    recursiveBoundary: {
      freezeReflection: false,
      maxDepth: 6,
      currentDepth: 2,
      reasons: [],
    },
    semanticTrustCore: trust,
    computationalIdentity: {
      coreAxioms: trust.axiomaticTags,
      semanticContinuity: 0.9,
      reflectiveBoundary: 0.85,
      trustedKernel: trust.trustKernelVersion,
    },
    neptuneReflectiveSemantics: {
      reasoningConfidence: 0.8,
      semanticSelfAssessment: 0.85,
      reflectiveUncertainty: 0.15,
    },
  };

  const p9Stub: P9EcoClosureAugmentation = {
    epistemicLimit: {
      undecidableRegions: [],
      unknowableStateDimensions: [],
      proofBoundaries: [],
      computationalLimits: [],
      confidenceHorizon: 0.7,
    },
    godelUnprovableProperties: [],
    confidenceHorizonAudit: {
      confidenceSaturated: false,
      confidenceHorizon: 0.7,
      observationGainProxy: 0.2,
      uncertaintyThreshold: 0.28,
    },
    proofBoundary: {
      provable: 0.25,
      empiricallySupported: 0.35,
      unprovable: 0.3,
      contradictory: 0.1,
    },
    epistemicAssessment: {
      undecidable: false,
      confidenceHorizon: 0.7,
      proofCompleteness: 0.6,
      reasoningBoundary: 0.85,
    },
  };

  it('mutation envelope detects boundary crossing', () => {
    const m = evaluateMutationEnvelope({ mutationDistance: 0.9, envelopeRadius: 0.35 });
    expect(m.withinIdentityRegion).toBe(false);
  });

  it('invariant ontology integrity is normalized', () => {
    const score = invariantOntologyIntegrityScore({
      physicalSafety: true,
      proofIntegrity: true,
      identityContinuity: true,
      semanticCore: true,
      terminationAxioms: true,
    });
    expect(score).toBe(1);
  });

  it('buildP10EcoClosureAugmentation produces existential carriers', () => {
    const p10 = buildP10EcoClosureAugmentation({
      state,
      p7: p7Stub,
      p8: p8Stub,
      p9: p9Stub,
      contractionProof: {
        contractive: true,
        lipschitzConstant: 0.7,
        proofConfidence: 0.75,
        boundedOscillation: true,
        monotonicPatchSequence: true,
        suggestRollback: false,
      },
    });
    expect(p10.existentialIdentity.invariantCore.length).toBeGreaterThan(0);
    expect(p10.semanticContinuity.reflectiveLineage).toHaveLength(28);
    expect(p10.existentialAssessment.continuityScore).toBeGreaterThanOrEqual(0);
    expect(p10.existentialAssessment.continuityScore).toBeLessThanOrEqual(1);
  });
});
