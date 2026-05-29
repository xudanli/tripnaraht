/**
 * Party Aggregation — 物理木桶原理 + 心理波峰交替（时分复用）。
 */

import type { ExperienceFlowModel } from '../models/experience-flow.model';
import { EXPERIENCE_FLOW_SCHEMA_V1 } from '../models/experience-flow.model';
import type { HumanCapabilityModel } from '../models/human-capability.model';
import type {
  PartyAggregationResult,
  PersonaTimeSlice,
  TravelPartyPersona,
} from '../models/travel-party-persona.model';

const CLAMP01 = (x: number) => Math.max(0, Math.min(1, x));

const PACE_ORDER = { SLOW: 0, MEDIUM: 1, FAST: 2 } as const;
const RISK_ORDER = { LOW: 0, MEDIUM: 1, HIGH: 2 } as const;

function minPace(
  a: HumanCapabilityModel['preferredPace'],
  b: HumanCapabilityModel['preferredPace'],
): HumanCapabilityModel['preferredPace'] {
  return PACE_ORDER[a] <= PACE_ORDER[b] ? a : b;
}

function minRisk(
  a: HumanCapabilityModel['riskTolerance'],
  b: HumanCapabilityModel['riskTolerance'],
): HumanCapabilityModel['riskTolerance'] {
  return RISK_ORDER[a] <= RISK_ORDER[b] ? a : b;
}

/**
 * 物理层聚合：木桶原理（最弱环节决定全队硬门槛）。
 */
export function aggregatePhysicalCapability(
  personas: TravelPartyPersona[],
  baseProfileId = 'party-aggregated',
): { effective: HumanCapabilityModel; hardGateTriggeredBy: string[] } {
  if (!personas.length) {
    throw new Error('aggregatePhysicalCapability: empty personas');
  }

  let maxDailyAscentM = Infinity;
  let rollingAscent3DaysM = Infinity;
  let maxSlopePct = Infinity;
  let maxElevationM = Infinity;
  let preferredPace: HumanCapabilityModel['preferredPace'] = 'FAST';
  let riskTolerance: HumanCapabilityModel['riskTolerance'] = 'HIGH';
  const hardGateTriggeredBy: string[] = [];

  for (const p of personas) {
    const c = p.capability;
    if (c.maxDailyAscentM < maxDailyAscentM) {
      maxDailyAscentM = c.maxDailyAscentM;
      hardGateTriggeredBy.push(`${p.memberId}:maxDailyAscentM`);
    }
    if (c.rollingAscent3DaysM < rollingAscent3DaysM) {
      rollingAscent3DaysM = c.rollingAscent3DaysM;
      hardGateTriggeredBy.push(`${p.memberId}:rollingAscent3DaysM`);
    }
    if (c.maxSlopePct < maxSlopePct) {
      maxSlopePct = c.maxSlopePct;
      hardGateTriggeredBy.push(`${p.memberId}:maxSlopePct`);
    }
    if (c.maxElevationM !== undefined && c.maxElevationM < maxElevationM) {
      maxElevationM = c.maxElevationM;
      hardGateTriggeredBy.push(`${p.memberId}:maxElevationM`);
    }
    preferredPace = minPace(preferredPace, c.preferredPace);
    riskTolerance = minRisk(riskTolerance, c.riskTolerance);
  }

  const effective: HumanCapabilityModel = {
    profileId: baseProfileId,
    maxDailyAscentM: Number.isFinite(maxDailyAscentM) ? maxDailyAscentM : 800,
    rollingAscent3DaysM: Number.isFinite(rollingAscent3DaysM) ? rollingAscent3DaysM : 2000,
    maxSlopePct: Number.isFinite(maxSlopePct) ? maxSlopePct : 25,
    preferredPace,
    riskTolerance,
    highAltitudeExperience: 'NONE',
    ...(Number.isFinite(maxElevationM) ? { maxElevationM } : {}),
  };

  return { effective, hardGateTriggeredBy: [...new Set(hardGateTriggeredBy)] };
}

function tempoFromWeight(
  personas: TravelPartyPersona[],
  slice: PersonaTimeSlice,
): { dominantMemberId: string; tempo: ExperienceFlowModel['tempo'] } {
  let best = personas[0];
  let bestW = -1;
  for (const p of personas) {
    const slices = p.timeSlices?.length ? p.timeSlices : [];
    const match = slices.find(
      (s) => s.startLocal <= slice.startLocal && s.endLocal >= slice.endLocal,
    );
    const w = match?.heterogeneityWeight ?? p.experience.heterogeneityIndex;
    if (w > bestW) {
      bestW = w;
      best = p;
    }
  }
  const dominantSlice = best.timeSlices?.find(
    (s) => s.startLocal <= slice.startLocal && s.endLocal >= slice.endLocal,
  );
  return {
    dominantMemberId: best.memberId,
    tempo: dominantSlice?.preferredTempo ?? best.experience.tempo,
  };
}

/**
 * 心理层聚合：默认取最保守 tempo；若提供 timeSlices 则生成时分复用计划。
 */
export function aggregateExperienceFlow(
  personas: TravelPartyPersona[],
  options?: { date?: string; defaultSlices?: PersonaTimeSlice[] },
): Pick<PartyAggregationResult, 'effectiveExperienceFlow' | 'rhythmMultiplexPlan'> {
  const tempoPriority = { EMPATHY_RECOVERY: 0, BALANCED: 1, ACCELERATED: 2 } as const;
  let dominantTempo: ExperienceFlowModel['tempo'] = 'ACCELERATED';
  for (const p of personas) {
    if (tempoPriority[p.experience.tempo] < tempoPriority[dominantTempo]) {
      dominantTempo = p.experience.tempo;
    }
  }

  const heterogeneityIndex = CLAMP01(
    personas.reduce((s, p) => s + p.experience.heterogeneityIndex, 0) / personas.length,
  );
  const surpriseBuffer = CLAMP01(Math.min(...personas.map((p) => p.experience.surpriseBuffer)));
  const currentFrictionCapacity = CLAMP01(
    Math.min(...personas.map((p) => p.experience.currentFrictionCapacity)),
  );

  const effectiveExperienceFlow: ExperienceFlowModel = {
    schemaVersion: EXPERIENCE_FLOW_SCHEMA_V1,
    tempo: dominantTempo,
    heterogeneityIndex,
    surpriseBuffer,
    currentFrictionCapacity,
    narrativeTone:
      dominantTempo === 'EMPATHY_RECOVERY'
        ? 'empathetic_reassurance'
        : dominantTempo === 'ACCELERATED'
          ? 'curious_discovery'
          : 'balanced_warm',
  };

  const slices = options?.defaultSlices ?? [];
  const rhythmMultiplexPlan = slices.map((slice) => {
    const { dominantMemberId, tempo } = tempoFromWeight(personas, slice);
    return {
      date: options?.date ?? '',
      slotHint: `${slice.startLocal}-${slice.endLocal}`,
      dominantMemberId,
      tempo,
      rationale: `time-division multiplex: ${dominantMemberId} dominant in window`,
    };
  });

  return {
    effectiveExperienceFlow,
    rhythmMultiplexPlan: rhythmMultiplexPlan.length ? rhythmMultiplexPlan : undefined,
  };
}

/**
 * 完整派对聚合：供 WorldModelContext 写入。
 */
export function aggregateTravelParty(
  personas: TravelPartyPersona[],
  options?: { date?: string; defaultSlices?: PersonaTimeSlice[] },
): PartyAggregationResult {
  const { effective, hardGateTriggeredBy } = aggregatePhysicalCapability(personas);
  const { effectiveExperienceFlow, rhythmMultiplexPlan } = aggregateExperienceFlow(personas, options);
  return {
    effectiveCapability: effective,
    effectiveExperienceFlow,
    hardGateTriggeredBy,
    rhythmMultiplexPlan,
  };
}
