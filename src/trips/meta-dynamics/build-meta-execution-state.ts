/**
 * Fold meta-reflection into a compact {@link MetaExecutionState} fingerprint for audit / G(F, obs).
 */

import type { TripWorldState } from '../decision/world-model';
import {
  DEFAULT_ECO_CLOSURE_THRESHOLDS,
} from '../execution-cognitive-orchestrator/closure-controller';
import type { MetaReflection } from '../meta-reflection/meta-reflection.types';
import type { MetaExecutionState } from './meta-state.types';

function clamp01(x: number): number {
  return Math.min(1, Math.max(0, x));
}

export function buildMetaExecutionState(
  state: TripWorldState,
  reflection: MetaReflection,
): MetaExecutionState {
  const eco = state.policies?.ecoClosure;
  const sem = eco?.convergenceSemantics;
  const convergencePolicy = `res:${sem?.epsilonResidual ?? 0.06}|man:${sem?.epsilonManifold ?? 0.08}|fp:${eco?.useFixedPointIterationGate ? 1 : 0}`;
  const envStrategy =
    typeof process !== 'undefined' ? process.env?.TRIP_ECO_CORRECTION_STRATEGY : undefined;
  const patchStrategy = String(eco?.correctionStrategy ?? envStrategy ?? 'full_neptune_retry');
  const causal = state.signals.reflectiveCausalModel;
  const causalUpdatePolicy = causal
    ? `${causal.meta.origin}|epoch:${causal.meta.revisionEpoch ?? 0}`
    : 'none';
  const driftRef = eco?.driftMax ?? DEFAULT_ECO_CLOSURE_THRESHOLDS.driftMax;
  const proofSemantics = `p6_prob+p5_contract|driftRef:${driftRef.toFixed(2)}`;

  const adaptationRate = clamp01(
    0.25 * reflection.policyDrift +
      0.25 * reflection.convergenceRuleChange +
      0.25 * reflection.semanticMutation +
      0.25 * reflection.causalTopologyMutation,
  );

  return {
    convergencePolicy,
    patchStrategy,
    causalUpdatePolicy,
    proofSemantics,
    adaptationRate,
  };
}
