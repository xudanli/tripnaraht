/**
 * Assemble P9 epistemic-boundary carriers for {@link EcoClosureDigestSlice}.
 */

import type { ExecutionUncertainty } from '../execution-uncertainty/uncertainty.types';
import type { ContractionProof } from '../execution-formal-proof/contraction-proof.types';
import type { RecursiveReasoningAssessment } from '../recursive-semantics/recursive-evaluator';
import type { SelfModel } from '../recursive-semantics/self-model.types';
import type { BayesianCausalUpdateResult } from '../execution-probabilistic-dynamics/bayesian-causal-update';
import { listUnprovableExecutionProperties, type UnprovableExecutionProperty } from './godel-boundary';
import { evaluateConfidenceHorizon, type ConfidenceHorizonResult } from './confidence-horizon';
import { evaluateProofBoundary, type ProofBoundary } from './proof-incompleteness';
import { buildEpistemicLimit } from './build-epistemic-limit';
import type { EpistemicLimit } from './epistemic-limit.types';
import type { EpistemicAssessment } from './neptune-epistemic-assessment.types';

function clamp01(x: number): number {
  return Math.min(1, Math.max(0, x));
}

function meanPosteriorVariance(b: BayesianCausalUpdateResult | undefined): number {
  if (!b?.edges?.length) return 0;
  return b.edges.reduce((s, e) => s + e.posteriorVariance, 0) / b.edges.length;
}

function buildEpistemicAssessment(input: {
  epistemicLimit: EpistemicLimit;
  confidenceSaturated: boolean;
  proofBoundary: ProofBoundary;
  recursiveReasoning: RecursiveReasoningAssessment;
  unprovableCount: number;
}): EpistemicAssessment {
  const proofCompleteness = clamp01(
    input.proofBoundary.provable + input.proofBoundary.empiricallySupported,
  );
  return {
    undecidable:
      input.unprovableCount > 0 ||
      input.confidenceSaturated ||
      input.epistemicLimit.undecidableRegions.length > 1,
    confidenceHorizon: input.epistemicLimit.confidenceHorizon,
    proofCompleteness,
    reasoningBoundary: clamp01(1 - input.recursiveReasoning.selfReferenceRisk),
  };
}

export interface P9EcoClosureAugmentation {
  epistemicLimit: EpistemicLimit;
  godelUnprovableProperties: UnprovableExecutionProperty[];
  confidenceHorizonAudit: ConfidenceHorizonResult;
  proofBoundary: ProofBoundary;
  epistemicAssessment: EpistemicAssessment;
}

export function buildP9EcoClosureAugmentation(input: {
  executionUncertainty: ExecutionUncertainty;
  contractionProof?: ContractionProof;
  recursiveReasoning: RecursiveReasoningAssessment;
  selfModel: SelfModel;
  bayesianCausal?: BayesianCausalUpdateResult;
  probabilisticTailMass: number;
}): P9EcoClosureAugmentation {
  const causalVar = meanPosteriorVariance(input.bayesianCausal);

  const observationGainProxy = clamp01(
    input.executionUncertainty.confidence * (1 - input.executionUncertainty.entropy * 0.8),
  );

  const horizonAudit = evaluateConfidenceHorizon({
    uncertaintyVariance: input.executionUncertainty.variance,
    observationGainProxy,
  });

  const godelUnprovableProperties = listUnprovableExecutionProperties({
    executionUncertainty: input.executionUncertainty,
    reflectiveDepth: input.selfModel.reflectiveDepth,
    causalPosteriorMeanVariance: causalVar,
  });

  const epistemicLimit = buildEpistemicLimit({
    executionUncertainty: input.executionUncertainty,
    confidenceHorizonScalar: horizonAudit.confidenceHorizon,
  });

  const proofBoundary = evaluateProofBoundary({
    contractionProof: input.contractionProof,
    probabilisticTailMass: input.probabilisticTailMass,
    recursiveSelfReferenceRisk: input.recursiveReasoning.selfReferenceRisk,
    causalLikelihood: input.bayesianCausal?.observationLikelihood ?? 1,
  });

  const epistemicAssessment = buildEpistemicAssessment({
    epistemicLimit,
    confidenceSaturated: horizonAudit.confidenceSaturated,
    proofBoundary,
    recursiveReasoning: input.recursiveReasoning,
    unprovableCount: godelUnprovableProperties.length,
  });

  return {
    epistemicLimit,
    godelUnprovableProperties,
    confidenceHorizonAudit: horizonAudit,
    proofBoundary,
    epistemicAssessment,
  };
}
