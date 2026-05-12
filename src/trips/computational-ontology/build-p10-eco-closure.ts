/**
 * Assemble P10 existential / ontological carriers for {@link EcoClosureDigestSlice}.
 */

import type { TripWorldState } from '../decision/world-model';
import type { ContractionProof } from '../execution-formal-proof/contraction-proof.types';
import type { P7EcoClosureAugmentation } from '../meta-dynamics/build-p7-eco-closure';
import type { P8EcoClosureAugmentation } from '../recursive-semantics/build-p8-eco-closure';
import type { P9EcoClosureAugmentation } from '../epistemic-boundary/build-p9-eco-closure';
import { buildInvariantOntology, invariantOntologyIntegrityScore } from './invariant-ontology';
import { buildSemanticContinuity } from './semantic-continuity';
import { evaluateMutationEnvelope } from './mutation-envelope';
import type { ExistentialIdentity } from './existential-identity.types';
import type { InvariantOntology } from './invariant-ontology';
import type { SemanticContinuity } from './semantic-continuity';
import type { MutationEnvelopeAudit } from './mutation-envelope';
import type { ExistentialAssessment } from './existential-assessment.types';

function clamp01(x: number): number {
  return Math.min(1, Math.max(0, x));
}

function buildExistentialIdentity(input: {
  invariantOntology: InvariantOntology;
  semanticContinuity: SemanticContinuity;
  mutationEnvelopeAudit: MutationEnvelopeAudit;
  trustedKernelLabel: string;
}): ExistentialIdentity {
  const coreTags: string[] = [];
  if (input.invariantOntology.physicalSafety) coreTags.push('physical_safety');
  if (input.invariantOntology.proofIntegrity) coreTags.push('proof_integrity');
  if (input.invariantOntology.identityContinuity) coreTags.push('identity_continuity');
  if (input.invariantOntology.semanticCore) coreTags.push('semantic_core');
  if (input.invariantOntology.terminationAxioms) coreTags.push('termination');

  return {
    invariantCore: coreTags,
    semanticContinuity: input.semanticContinuity.continuityConfidence,
    reflectivePersistence: clamp01(
      input.semanticContinuity.continuityConfidence * (input.mutationEnvelopeAudit.withinIdentityRegion ? 1 : 0.35),
    ),
    mutationEnvelope: input.mutationEnvelopeAudit.envelopeRadius,
    ontologicalAnchor: input.trustedKernelLabel,
  };
}

function buildExistentialAssessment(input: {
  withinEnvelope: boolean;
  semanticContinuity: SemanticContinuity;
  invariantOntology: InvariantOntology;
  epistemicUndecidable?: boolean;
}): ExistentialAssessment {
  const ontologicalIntegrity = invariantOntologyIntegrityScore(input.invariantOntology);
  const stress = input.epistemicUndecidable ? 0.07 : 0;
  const continuityScore = clamp01(input.semanticContinuity.continuityConfidence - stress);
  return {
    identityStable:
      input.withinEnvelope &&
      continuityScore > 0.42 &&
      ontologicalIntegrity >= 0.5,
    continuityScore,
    mutationRisk: input.semanticContinuity.mutationDistance,
    ontologicalIntegrity,
  };
}

export interface P10EcoClosureAugmentation {
  existentialIdentity: ExistentialIdentity;
  invariantOntology: InvariantOntology;
  semanticContinuity: SemanticContinuity;
  mutationEnvelopeAudit: MutationEnvelopeAudit;
  existentialAssessment: ExistentialAssessment;
}

export function buildP10EcoClosureAugmentation(input: {
  state: TripWorldState;
  p7: P7EcoClosureAugmentation;
  p8: P8EcoClosureAugmentation;
  p9: P9EcoClosureAugmentation;
  contractionProof?: ContractionProof;
}): P10EcoClosureAugmentation {
  const causal = input.state.signals.reflectiveCausalModel;
  const semanticContinuity = buildSemanticContinuity({
    executionSemanticCoreHash: input.p7.executionIdentity.semanticCoreHash,
    causalModelId: causal?.modelId,
    revisionEpoch: causal?.meta.revisionEpoch ?? 0,
    metaReflection: input.p7.metaReflection,
  });

  const mutationEnvelopeAudit = evaluateMutationEnvelope({
    mutationDistance: semanticContinuity.mutationDistance,
    envelopeRadius: input.p7.executionIdentity.mutationEnvelope,
  });

  const invariantOntology = buildInvariantOntology({
    trustCore: input.p8.semanticTrustCore,
    suggestRollback: input.contractionProof?.suggestRollback ?? false,
    withinMutationEnvelope: mutationEnvelopeAudit.withinIdentityRegion,
  });

  const existentialIdentity = buildExistentialIdentity({
    invariantOntology,
    semanticContinuity,
    mutationEnvelopeAudit,
    trustedKernelLabel: input.p8.computationalIdentity.trustedKernel,
  });

  const existentialAssessment = buildExistentialAssessment({
    withinEnvelope: mutationEnvelopeAudit.withinIdentityRegion,
    semanticContinuity,
    invariantOntology,
    epistemicUndecidable: input.p9.epistemicAssessment?.undecidable,
  });

  return {
    existentialIdentity,
    invariantOntology,
    semanticContinuity,
    mutationEnvelopeAudit,
    existentialAssessment,
  };
}
