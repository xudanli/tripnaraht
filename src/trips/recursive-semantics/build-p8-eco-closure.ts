/**
 * Assemble P8 reflective carriers for {@link EcoClosureDigestSlice}.
 */

import type { TripWorldState } from '../decision/world-model';
import type { ExecutionUncertainty } from '../execution-uncertainty/uncertainty.types';
import type { ProbabilisticStabilityCertificate } from '../execution-probabilistic-dynamics';
import type { P7EcoClosureAugmentation } from '../meta-dynamics/build-p7-eco-closure';
import { buildSelfModel } from './build-self-model';
import { evaluateRecursiveReasoning } from './recursive-evaluator';
import { evaluateRecursiveBoundary } from './recursive-boundary';
import { buildSemanticTrustCore } from './semantic-trust-core';
import { buildComputationalIdentity } from './build-computational-identity';
import type { SelfModel } from './self-model.types';
import type { RecursiveReasoningAssessment } from './recursive-evaluator';
import type { RecursiveBoundaryResult } from './recursive-boundary';
import type { SemanticTrustCore } from './semantic-trust-core';
import type { ComputationalIdentity } from './computational-identity.types';
import type { NeptuneReflectiveSemanticAugmentation } from './neptune-reflective-output.types';

export interface P8EcoClosureAugmentation {
  selfModel: SelfModel;
  recursiveReasoning: RecursiveReasoningAssessment;
  recursiveBoundary: RecursiveBoundaryResult;
  semanticTrustCore: SemanticTrustCore;
  computationalIdentity: ComputationalIdentity;
  neptuneReflectiveSemantics: NeptuneReflectiveSemanticAugmentation;
}

function clamp01(x: number): number {
  return Math.min(1, Math.max(0, x));
}

function buildNeptuneReflectiveSemantics(input: {
  selfModel: SelfModel;
  assessment: RecursiveReasoningAssessment;
  executionUncertainty: ExecutionUncertainty;
}): NeptuneReflectiveSemanticAugmentation {
  const reasoningConfidence = clamp01(
    input.assessment.recursiveStability * input.selfModel.confidenceInReasoning,
  );
  const semanticSelfAssessment = input.assessment.semanticConsistency;
  const reflectiveUncertainty = clamp01(
    0.5 * input.executionUncertainty.variance +
      0.5 * input.assessment.selfReferenceRisk,
  );
  return {
    reasoningConfidence,
    semanticSelfAssessment,
    reflectiveUncertainty,
  };
}

export function buildP8EcoClosureAugmentation(input: {
  state: TripWorldState;
  p7: P7EcoClosureAugmentation;
  executionUncertainty: ExecutionUncertainty;
  probabilisticStability?: ProbabilisticStabilityCertificate;
  bayesianObservationLikelihood: number;
}): P8EcoClosureAugmentation {
  const mr = input.p7.metaReflection;
  const tailMass = input.probabilisticStability?.probabilityBelowEpsilon ?? 0;

  const selfModel = buildSelfModel({
    state: input.state,
    executionUncertainty: input.executionUncertainty,
    semanticIdentity: input.p7.executionIdentity.semanticCoreHash,
    metaReflection: mr,
    bayesianObservationLikelihood: input.bayesianObservationLikelihood,
    probabilisticTailMass: tailMass,
  });

  const recursiveReasoning = evaluateRecursiveReasoning({
    selfModel,
    metaPolicyDrift: mr.policyDrift,
    causalSemanticMutation: mr.semanticMutation,
  });

  const recursiveBoundary = evaluateRecursiveBoundary({
    reflectiveDepth: selfModel.reflectiveDepth,
    selfReferenceRisk: recursiveReasoning.selfReferenceRisk,
  });

  const semanticTrustCore = buildSemanticTrustCore();

  const computationalIdentity = buildComputationalIdentity({
    executionIdentity: input.p7.executionIdentity,
    trustCore: semanticTrustCore,
    boundary: recursiveBoundary,
  });

  const neptuneReflectiveSemantics = buildNeptuneReflectiveSemantics({
    selfModel,
    assessment: recursiveReasoning,
    executionUncertainty: input.executionUncertainty,
  });

  return {
    selfModel,
    recursiveReasoning,
    recursiveBoundary,
    semanticTrustCore,
    computationalIdentity,
    neptuneReflectiveSemantics,
  };
}
