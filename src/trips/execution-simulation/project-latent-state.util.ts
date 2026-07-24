/**
 * Project heuristic TravelPartyPersona → TravelLatentState (no LLM).
 */

import type { TravelPartyPersona } from '../decision/models/travel-party-persona.model';
import type {
  MotiveDistribution,
  PartyMemberLatent,
  RobustnessPartyContext,
  TravelLatentState,
} from '../multiverse/travel-latent-state.types';
import { DEFAULT_TRAVEL_LATENT_STATE } from '../multiverse/travel-latent-state.types';

const CLAMP01 = (x: number) => Math.max(0, Math.min(1, x));

function paceToExploration(pace: string): number {
  switch (pace) {
    case 'FAST':
      return 0.85;
    case 'SLOW':
      return 0.25;
    default:
      return 0.5;
  }
}

function paceToRelaxation(pace: string): number {
  switch (pace) {
    case 'SLOW':
      return 0.85;
    case 'FAST':
      return 0.2;
    default:
      return 0.5;
  }
}

function riskToAversion(risk: string): number {
  switch (risk) {
    case 'LOW':
      return 0.85;
    case 'HIGH':
      return 0.15;
    default:
      return 0.5;
  }
}

function fitnessToFatigueTolerance(persona: TravelPartyPersona): number {
  const ascent = persona.capability.maxDailyAscentM;
  if (ascent <= 500) return 0.35;
  if (ascent >= 1100) return 0.85;
  return CLAMP01((ascent - 500) / 600 * 0.5 + 0.35);
}

function frictionToExpressiveness(persona: TravelPartyPersona): number {
  const friction = persona.experience.currentFrictionCapacity ?? 0.5;
  const hetero = persona.experience.heterogeneityIndex ?? 0.5;
  return CLAMP01(0.4 * friction + 0.6 * hetero);
}

function tempoToSocialSeeking(tempo: string): number {
  switch (tempo) {
    case 'ACCELERATED':
      return 0.7;
    case 'BALANCED':
      return 0.5;
    case 'LEISURELY':
      return 0.35;
    default:
      return 0.5;
  }
}

export function projectLatentStateFromPersona(persona: TravelPartyPersona): TravelLatentState {
  const pace = persona.capability.preferredPace;
  const risk = persona.capability.riskTolerance;
  const tempo = persona.experience.tempo;

  const motive_distribution: MotiveDistribution = {
    detachment: CLAMP01(1 - tempoToSocialSeeking(tempo)),
    exploration: paceToExploration(pace),
    social_seeking: tempoToSocialSeeking(tempo),
    relaxation: paceToRelaxation(pace),
  };

  return {
    motive_distribution,
    fatigue_tolerance: fitnessToFatigueTolerance(persona),
    social_expressiveness: frictionToExpressiveness(persona),
    risk_aversion: riskToAversion(risk),
  };
}

export function projectRobustnessPartyFromPersonas(
  personas: TravelPartyPersona[],
  partyId = 'party-default',
): RobustnessPartyContext {
  if (!personas.length) {
    return {
      partyId,
      members: [{ userId: 'anonymous', latentState: { ...DEFAULT_TRAVEL_LATENT_STATE } }],
      cohesionIndex: 0.5,
    };
  }

  const members: PartyMemberLatent[] = personas.map(p => ({
    userId: p.memberId,
    displayName: p.displayName,
    latentState: projectLatentStateFromPersona(p),
  }));

  const avgCohesion =
    members.reduce((sum, m) => sum + m.latentState.motive_distribution.social_seeking, 0) /
    members.length;

  const heterogeneity =
    members.length > 1
      ? members.reduce((sum, m) => {
          const delta = Math.abs(m.latentState.fatigue_tolerance - members[0].latentState.fatigue_tolerance);
          return sum + delta;
        }, 0) /
        (members.length - 1)
      : 0;

  const cohesionIndex = CLAMP01(0.7 * avgCohesion + 0.3 * (1 - heterogeneity));

  return { partyId, members, cohesionIndex };
}
