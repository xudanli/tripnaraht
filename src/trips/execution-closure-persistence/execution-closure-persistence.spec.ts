import type { EcoClosureDigestSlice } from '../execution-cognitive-orchestrator/execution-cognitive-orchestrator.types';
import { buildEcoIdentityLedgerSnapshot } from './build-eco-identity-ledger';
import { evaluateIdentityContinuity } from './evaluate-identity-continuity';
import { gateEcoClosureSecondPass } from './eco-closure-policy-gate';
import { resolveCorrectionStrategyWithLedger } from './eco-closure-policy-gate';
import { finalizeEcoClosureDigestSlice } from './finalize-eco-closure-digest';
import type { TripWorldState } from '../decision/world-model';

describe('execution-closure-persistence', () => {
  const minimalSlice = (over?: Partial<EcoClosureDigestSlice>): EcoClosureDigestSlice =>
    ({
      neptunePasses: 1,
      final: {
        ecoDriftScore: 0.1,
        stabilityScore: 0.9,
        semanticConvergence: 0.85,
        shouldRerunNeptune: false,
        reasons: [],
        thresholds: { driftMax: 0.35, stabilityMin: 0.7, convergenceMin: 0.6 },
      },
      executionIdentity: {
        semanticCoreHash: 'c'.repeat(32),
        invariantCore: [],
        mutationEnvelope: 0.4,
      },
      semanticContinuity: {
        preservedInvariants: [],
        mutationDistance: 0.1,
        reflectiveLineage: 'lineage-a',
        continuityConfidence: 0.88,
      },
      existentialAssessment: {
        identityStable: true,
        continuityScore: 0.88,
        mutationRisk: 0.1,
        ontologicalIntegrity: 0.9,
      },
      metaExecutionState: {
        convergencePolicy: 'x',
        patchStrategy: 'full_neptune_retry',
        causalUpdatePolicy: 'y',
        proofSemantics: 'z',
        adaptationRate: 0.1,
      },
      metaStabilityGuard: {
        freezePolicyEvolution: false,
        reasons: [],
        adaptationRateLimit: 0.55,
        convergencePolicyMutationLimit: 0.4,
      },
      recursiveBoundary: {
        freezeReflection: false,
        maxDepth: 6,
        currentDepth: 2,
        reasons: [],
      },
      contractionProof: {
        contractive: true,
        lipschitzConstant: 0.7,
        proofConfidence: 0.8,
        boundedOscillation: true,
        monotonicPatchSequence: true,
        suggestRollback: false,
      },
      epistemicAssessment: {
        undecidable: false,
        confidenceHorizon: 0.7,
        proofCompleteness: 0.6,
        reasoningBoundary: 0.8,
      },
      confidenceHorizonAudit: {
        confidenceSaturated: false,
        confidenceHorizon: 0.7,
        observationGainProxy: 0.2,
        uncertaintyThreshold: 0.28,
      },
      ...over,
    }) as EcoClosureDigestSlice;

  it('gate blocks second pass when prior meta freeze', () => {
    const allow = gateEcoClosureSecondPass({
      priorLedger: {
        recordedAt: 'x',
        semanticCoreHash: 'a',
        reflectiveLineage: 'l',
        existentialContinuityScore: 0.8,
        ontologicalIntegrity: 0.9,
        epistemicUndecidable: false,
        confidenceSaturated: false,
        carryForwardMetaFreeze: true,
        carryForwardRecursiveFreeze: false,
        carryForwardSuggestRollback: false,
        digestFingerprint: 'abc',
      },
      baseAllowRetry: true,
    });
    expect(allow).toBe(false);
  });

  it('finalize attaches continuity proof', () => {
    const s = finalizeEcoClosureDigestSlice(minimalSlice(), undefined);
    expect(s.identityContinuityProof?.reasons).toContain('no_prior_ledger');
  });

  it('identity drift when semantic hash changes', () => {
    const prior = buildEcoIdentityLedgerSnapshot(minimalSlice());
    const cur = buildEcoIdentityLedgerSnapshot(
      minimalSlice({
        executionIdentity: {
          semanticCoreHash: 'd'.repeat(32),
          invariantCore: [],
          mutationEnvelope: 0.4,
        },
      }),
    );
    const proof = evaluateIdentityContinuity(prior, cur);
    expect(proof.sameSemanticCore).toBe(false);
    expect(proof.identityPreserved).toBe(false);
  });

  it('resolveCorrectionStrategyWithLedger upgrades rollback', () => {
    const state = {
      policies: {
        ecoClosure: { correctionStrategy: 'minimal_patch_then_neptune' as const },
      },
    } as unknown as TripWorldState;
    const s = resolveCorrectionStrategyWithLedger(state, {
      recordedAt: 'x',
      semanticCoreHash: 'a',
      reflectiveLineage: 'l',
      existentialContinuityScore: 0.8,
      ontologicalIntegrity: 0.9,
      epistemicUndecidable: false,
      confidenceSaturated: false,
      carryForwardMetaFreeze: false,
      carryForwardRecursiveFreeze: false,
      carryForwardSuggestRollback: true,
      digestFingerprint: 'abc',
    });
    expect(s).toBe('full_neptune_retry');
  });
});
