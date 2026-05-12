/**
 * Single entry to assemble all P7 audit carriers for {@link EcoClosureDigestSlice}.
 */

import type { TripWorldState } from '../decision/world-model';
import type { ConvergenceSemanticsOptions } from '../execution-convergence-formalization/convergence-semantics.types';
import type { LyapunovState } from '../execution-stability/lyapunov.types';
import type { ProbabilisticStabilityCertificate } from '../execution-probabilistic-dynamics';
import { buildExecutionIdentity } from '../identity-preservation/build-execution-identity';
import { buildMetaReflection } from '../meta-reflection/build-meta-reflection';
import { evaluateAdaptiveLyapunov } from './adaptive-lyapunov';
import { buildMetaExecutionState } from './build-meta-execution-state';
import { evaluateMetaStabilityGuard } from './meta-stability-guard';
import type { AdaptiveLyapunov } from './adaptive-lyapunov';
import type { MetaExecutionState } from './meta-state.types';
import type { MetaStabilityGuardResult } from './meta-stability-guard';
import type { MetaReflection } from '../meta-reflection/meta-reflection.types';
import type { ExecutionIdentity } from '../identity-preservation/identity-preservation.types';

export interface P7EcoClosureAugmentation {
  metaExecutionState: MetaExecutionState;
  adaptiveLyapunov: AdaptiveLyapunov;
  metaReflection: MetaReflection;
  executionIdentity: ExecutionIdentity;
  metaStabilityGuard: MetaStabilityGuardResult;
}

export function buildP7EcoClosureAugmentation(input: {
  state: TripWorldState;
  lyapunov: LyapunovState;
  probabilisticStability?: ProbabilisticStabilityCertificate;
  convergenceOpts?: ConvergenceSemanticsOptions | null;
  iterationKind: 'single_pass' | 'two_pass';
}): P7EcoClosureAugmentation {
  const metaReflection = buildMetaReflection(input.state, input.convergenceOpts);
  const metaExecutionState = buildMetaExecutionState(input.state, metaReflection);
  const proofSemanticsFingerprint = metaExecutionState.proofSemantics;
  const adaptiveLyapunov = evaluateAdaptiveLyapunov({
    lyapunov: input.lyapunov,
    probabilisticStability: input.probabilisticStability,
    proofSemanticsFingerprint,
    iterationKind: input.iterationKind,
  });
  const executionIdentity = buildExecutionIdentity(input.state);
  const metaStabilityGuard = evaluateMetaStabilityGuard({
    adaptationRate: metaExecutionState.adaptationRate,
    convergenceRuleChange: metaReflection.convergenceRuleChange,
  });

  return {
    metaExecutionState,
    adaptiveLyapunov,
    metaReflection,
    executionIdentity,
    metaStabilityGuard,
  };
}
