/**
 * 将 TripPlanRequest.party / party_profile 投影为 TravelPartyPersona[]（启发式，无 LLM）。
 */

import type { TripPlanRequest } from '../../../agent/interfaces/trip-plan.interface';
import type { PartyAggregationResult, TravelPartyPersona } from '../models/travel-party-persona.model';
import type { WorldModelContext } from '../shared/world-model.types';
import { aggregateTravelParty } from './party-aggregation.util';

function fitnessToAscent(fitness: 'low' | 'medium' | 'high' | undefined): number {
  switch (fitness) {
    case 'low':
      return 400;
    case 'high':
      return 1200;
    default:
      return 800;
  }
}

function fitnessToSlope(fitness: 'low' | 'medium' | 'high' | undefined): number {
  switch (fitness) {
    case 'low':
      return 15;
    case 'high':
      return 35;
    default:
      return 25;
  }
}

/**
 * 从请求中的 party 字段构建多人格向量（冰岛「带父母」等场景的默认启发式）。
 */
export function projectPartyPersonasFromTripRequest(
  request: Pick<TripPlanRequest, 'party' | 'party_profile' | 'party_mobility_note_zh'>,
): TravelPartyPersona[] {
  const personas: TravelPartyPersona[] = [];
  const baseFitness = request.party?.fitness_level ?? request.party_profile?.fitness ?? 'medium';
  const risk =
    request.party_profile?.risk_tolerance === 'LOW'
      ? 'LOW'
      : request.party_profile?.risk_tolerance === 'HIGH'
        ? 'HIGH'
        : 'MEDIUM';

  personas.push({
    memberId: 'primary',
    role: 'PRIMARY_TRAVELER',
    capability: {
      maxDailyAscentM: fitnessToAscent(baseFitness === 'low' ? 'medium' : baseFitness),
      rollingAscent3DaysM: fitnessToAscent(baseFitness === 'low' ? 'medium' : baseFitness) * 2.5,
      maxSlopePct: fitnessToSlope(baseFitness === 'low' ? 'medium' : baseFitness),
      preferredPace: baseFitness === 'high' ? 'FAST' : 'MEDIUM',
      riskTolerance: risk,
    },
    experience: {
      tempo: 'ACCELERATED',
      heterogeneityIndex: 0.72,
      surpriseBuffer: 0.28,
      currentFrictionCapacity: 0.65,
    },
    timeSlices: [
      {
        startLocal: '09:00',
        endLocal: '13:00',
        heterogeneityWeight: 0.55,
        preferredTempo: 'BALANCED',
      },
      {
        startLocal: '20:00',
        endLocal: '23:59',
        heterogeneityWeight: 0.85,
        preferredTempo: 'ACCELERATED',
      },
    ],
  });

  if (request.party?.has_elderly) {
    personas.push({
      memberId: 'elderly_companion',
      displayName: '父母',
      role: 'ELDERLY',
      capability: {
        maxDailyAscentM: 250,
        rollingAscent3DaysM: 600,
        maxSlopePct: 12,
        preferredPace: 'SLOW',
        riskTolerance: 'LOW',
        maxElevationM: 1200,
      },
      experience: {
        tempo: 'EMPATHY_RECOVERY',
        heterogeneityIndex: 0.25,
        surpriseBuffer: 0.05,
        currentFrictionCapacity: 0.2,
      },
      timeSlices: [
        {
          startLocal: '09:00',
          endLocal: '18:00',
          heterogeneityWeight: 0.9,
          preferredTempo: 'EMPATHY_RECOVERY',
        },
      ],
    });
  }

  if (request.party?.has_children) {
    personas.push({
      memberId: 'child',
      role: 'CHILD',
      capability: {
        maxDailyAscentM: 300,
        rollingAscent3DaysM: 700,
        maxSlopePct: 14,
        preferredPace: 'SLOW',
        riskTolerance: 'LOW',
      },
      experience: {
        tempo: 'BALANCED',
        heterogeneityIndex: 0.45,
        surpriseBuffer: 0.15,
        currentFrictionCapacity: 0.35,
      },
    });
  }

  return personas;
}

/**
 * 将派对聚合写入 WorldModelContext（覆盖 human + experienceFlow 为木桶聚合结果）。
 */
export function enrichWorldModelWithPartyAggregation(
  world: WorldModelContext,
  personas: TravelPartyPersona[],
  options?: { date?: string },
): WorldModelContext & { partyAggregation: PartyAggregationResult } {
  const partyAggregation = aggregateTravelParty(personas, {
    date: options?.date,
    defaultSlices: personas[0]?.timeSlices,
  });
  return {
    ...world,
    partyPersonas: personas,
    partyAggregation,
    human: partyAggregation.effectiveCapability,
    experienceFlow: partyAggregation.effectiveExperienceFlow,
  };
}
