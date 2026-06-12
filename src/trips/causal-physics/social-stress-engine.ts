/**
 * Social stress propagation — physical perturbation → human latent space → temporal pressure.
 * Extends P-Next 9 intervention-engine with organizational robustness signals.
 */

import type { RobustnessPartyContext } from '../multiverse/travel-latent-state.types';
import type { CausalGraph, CausalIntervention } from './causal-graph.types';
import { applyDoOperator } from './intervention-engine';

const HUMAN_ID = 'domain:human';
const TEMPORAL_ID = 'domain:temporal';

function clamp01(x: number): number {
  return Math.min(1, Math.max(0, x));
}

export interface RolloutNodeStressInput {
  nodeId: string;
  /** Leg / activity duration in minutes */
  durationMinutes: number;
  /** Optional DEM elevation gain (m); when absent, derived from duration proxy */
  elevationGainM?: number;
  /** Weather severity proxy [0, 1] */
  weatherSeverity: number;
}

export interface StepStressResult {
  socialStress: number;
  fatigueDelta: number;
  /** Per-member breakdown for audit / UI */
  memberStress: Array<{ userId: string; emotionalExplosionRisk: number }>;
}

/**
 * Evaluate per-step social stress from physical load + party latent vectors.
 * Causal chain: duration + elevation → fatigue → expressiveness × fatigue × weather → socialStress.
 */
export function evaluateStepStress(
  input: RolloutNodeStressInput,
  party: RobustnessPartyContext,
): StepStressResult {
  const elevationGain = input.elevationGainM ?? Math.max(0, input.durationMinutes * 0.5);
  let baseFatigueDelta = (input.durationMinutes / 60) * 0.1;
  if (elevationGain > 500) {
    baseFatigueDelta *= 1 + elevationGain / 1000;
  }

  const timePressureFactor = input.durationMinutes > 240 ? 1.5 : 1.0;
  const memberStress: StepStressResult['memberStress'] = [];
  let totalSocialStress = 0;

  for (const member of party.members) {
    const state = member.latentState;
    const individualFatigueImpact =
      (baseFatigueDelta * timePressureFactor) / Math.max(0.15, state.fatigue_tolerance);

    const emotionalExplosionRisk = clamp01(
      state.social_expressiveness *
        individualFatigueImpact *
        (1 + input.weatherSeverity) *
        (1 + (1 - party.cohesionIndex) * 0.3),
    );

    memberStress.push({ userId: member.userId, emotionalExplosionRisk });
    totalSocialStress += emotionalExplosionRisk;
  }

  const meanStress = party.members.length
    ? totalSocialStress / party.members.length
    : 0;

  return {
    socialStress: clamp01(meanStress),
    fatigueDelta: baseFatigueDelta,
    memberStress,
  };
}

/**
 * Propagate socialStress → domain:temporal.meanTemporalPressure on causal graph.
 * Edge: domain:human.socialStress → domain:temporal.pressure (via state patch).
 */
export function propagateSocialStressToTemporal(
  graph: CausalGraph,
  socialStress: number,
): CausalGraph {
  const humanNode = graph.nodes.find(n => n.id === HUMAN_ID);
  const interventions: CausalIntervention[] = [];

  if (humanNode) {
    interventions.push({
      id: 'social-stress-patch',
      targetNodeId: HUMAN_ID,
      doOperator: false,
      statePatch: { socialStress: clamp01(socialStress) },
    });
  }

  const temporalNode = graph.nodes.find(n => n.id === TEMPORAL_ID);
  if (temporalNode) {
    const existing = Number(temporalNode.state.meanTemporalPressure ?? 0);
    interventions.push({
      id: 'temporal-social-coupling',
      targetNodeId: TEMPORAL_ID,
      doOperator: false,
      statePatch: {
        meanTemporalPressure: clamp01(0.55 * socialStress + 0.45 * existing),
        socialStressCoupling: clamp01(socialStress),
      },
    });
  }

  if (!interventions.length) {
    return graph;
  }
  return applyDoOperator(graph, interventions);
}

/** Organizational collapse threshold — above this, rollout counts as "team fracture". */
export const ORGANIZATIONAL_STRESS_THRESHOLD = 0.72;

export function isOrganizationalFailure(stressPeak: number): boolean {
  return stressPeak >= ORGANIZATIONAL_STRESS_THRESHOLD;
}
