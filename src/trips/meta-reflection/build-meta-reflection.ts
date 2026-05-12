/**
 * Materialize {@link MetaReflection} from world policies + causal model (single-tick; compare to fixed baselines).
 */

import type { TripWorldState } from '../decision/world-model';
import type { ConvergenceSemanticsOptions } from '../execution-convergence-formalization/convergence-semantics.types';
import { DEFAULT_ECO_CLOSURE_THRESHOLDS } from '../execution-cognitive-orchestrator/closure-controller';
import type { MetaReflection } from './meta-reflection.types';

function clamp01(x: number): number {
  return Math.min(1, Math.max(0, x));
}

const BASE_EPS_RES = 0.06;
const BASE_EPS_MAN = 0.08;

export function buildMetaReflection(
  state: TripWorldState,
  convergenceOpts?: ConvergenceSemanticsOptions | null,
): MetaReflection {
  const eco = state.policies?.ecoClosure;
  const t = {
    driftMax: eco?.driftMax ?? DEFAULT_ECO_CLOSURE_THRESHOLDS.driftMax,
    stabilityMin: eco?.stabilityMin ?? DEFAULT_ECO_CLOSURE_THRESHOLDS.stabilityMin,
    convergenceMin: eco?.convergenceMin ?? DEFAULT_ECO_CLOSURE_THRESHOLDS.convergenceMin,
  };
  const d0 = DEFAULT_ECO_CLOSURE_THRESHOLDS;
  const policyDrift = clamp01(
    (Math.abs(t.driftMax - d0.driftMax) +
      Math.abs(t.stabilityMin - d0.stabilityMin) +
      Math.abs(t.convergenceMin - d0.convergenceMin)) /
      1.2,
  );

  const res =
    convergenceOpts?.epsilonResidual ??
    eco?.convergenceSemantics?.epsilonResidual ??
    BASE_EPS_RES;
  const man =
    convergenceOpts?.epsilonManifold ??
    eco?.convergenceSemantics?.epsilonManifold ??
    BASE_EPS_MAN;
  const convergenceRuleChange = clamp01(
    (Math.abs(res - BASE_EPS_RES) + Math.abs(man - BASE_EPS_MAN)) / 0.2,
  );

  const causal = state.signals.reflectiveCausalModel;
  const epoch = causal?.meta.revisionEpoch ?? 0;
  const semanticMutation = clamp01(Math.min(1, epoch / 12));

  const edges = causal?.edges?.length ?? 0;
  const causalTopologyMutation = clamp01(Math.min(1, edges / 40));

  return {
    policyDrift,
    convergenceRuleChange,
    semanticMutation,
    causalTopologyMutation,
  };
}
