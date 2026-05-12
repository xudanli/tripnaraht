/**
 * Materialize {@link SelfModel} from P6/P7 carriers (single-tick).
 */

import type { TripWorldState } from '../decision/world-model';
import type { ExecutionUncertainty } from '../execution-uncertainty/uncertainty.types';
import type { MetaReflection } from '../meta-reflection/meta-reflection.types';
import type { SelfModel } from './self-model.types';

function clamp01(x: number): number {
  return Math.min(1, Math.max(0, x));
}

export function buildSelfModel(input: {
  state: TripWorldState;
  executionUncertainty: ExecutionUncertainty;
  semanticIdentity: string;
  metaReflection: MetaReflection;
  bayesianObservationLikelihood: number;
  probabilisticTailMass: number;
}): SelfModel {
  const u = input.executionUncertainty;
  const idx = input.state.signals.physicsFieldIndex;

  const beliefsAboutWorld: Record<string, number> = {
    signal_entropy: u.entropy,
    pooled_variance: u.variance,
    observation_confidence: u.confidence,
    physics_legs: idx?.byLegId ? Object.keys(idx.byLegId).length / 24 : 0,
  };

  const beliefsAboutBeliefs: Record<string, number> = {
    epistemic_calibration: u.confidence,
    meta_policy_alignment: clamp01(1 - input.metaReflection.policyDrift),
    convergence_rule_stability: clamp01(1 - input.metaReflection.convergenceRuleChange),
    causal_revision_pressure: input.metaReflection.semanticMutation,
  };

  const confidenceInReasoning = clamp01(
    0.35 * input.bayesianObservationLikelihood +
      0.35 * input.probabilisticTailMass +
      0.3 * u.confidence,
  );

  const reflectiveDepth =
    1 +
    Math.round(
      4 * input.metaReflection.semanticMutation + 3 * input.metaReflection.policyDrift,
    );

  return {
    beliefsAboutWorld,
    beliefsAboutBeliefs,
    confidenceInReasoning,
    semanticIdentity: input.semanticIdentity,
    reflectiveDepth,
  };
}
