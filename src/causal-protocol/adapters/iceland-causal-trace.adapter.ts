import { randomBytes } from 'crypto';
import type { IcelandSelfDriveCausalOutput } from '../../trips/causal-runtime/domains/iceland-self-drive-causal.types';
import { analyzeIcelandSelfDriveLeg } from '../../trips/causal-runtime/domains/iceland-causal-bridge';
import { isIcelandDestination } from '../../trips/causal-runtime/domains/trip-world-state-iceland-causal.util';
import { CAUSAL_EXPLANATION_KEYS } from '../causal-explanation.registry';
import { CAUSAL_SOURCE_REGISTRY } from '../causal-source.registry';
import type {
  CausalEffectV1,
  CausalFactRef,
  CausalProblemRef,
} from '../causal-trace-node.types';

export interface IcelandCausalTraceSeedInput {
  tripId: string;
  problemId: string;
  destination?: string | null;
  routeLabel?: string;
  distanceKm?: number;
  durationMinutes?: number;
  windMps?: number;
  appointmentSlackMinutes?: number;
  sessionAssessment?: IcelandSelfDriveCausalOutput;
}

export interface IcelandCausalTraceSeed {
  facts: CausalFactRef[];
  effects: CausalEffectV1[];
  problem: CausalProblemRef;
  assessment?: IcelandSelfDriveCausalOutput;
}

export function buildIcelandCausalTraceSeed(
  input: IcelandCausalTraceSeedInput,
): IcelandCausalTraceSeed | undefined {
  if (!isIcelandDestination(input.destination ?? undefined)) {
    return undefined;
  }

  const assessment =
    input.sessionAssessment ??
    analyzeIcelandSelfDriveLeg({
      routeLabel: input.routeLabel ?? '冰岛路段',
      distanceKm: input.distanceKm ?? 40,
      durationMinutes: input.durationMinutes ?? 46,
      windMps: input.windMps ?? 12,
      appointmentSlackMinutes: input.appointmentSlackMinutes ?? 15,
      region: 'south_coast',
    });

  const windMps = assessment.input.windMps;
  const now = new Date().toISOString();
  const segmentId = `${input.tripId}:segment:${input.problemId}`;

  const windFactId = `fact_wind_${input.problemId}`;
  const facts: CausalFactRef[] = [
    {
      factId: windFactId,
      factType: 'WEATHER_WIND_GUST',
      subjectType: 'SEGMENT',
      subjectId: segmentId,
      observedAt: now,
      source: CAUSAL_SOURCE_REGISTRY.ICELAND_SELF_DRIVE_RUNTIME,
      confidence: 0.9,
      attributes: {
        windMps,
        routeLabel: assessment.input.routeLabel,
        distanceKm: assessment.input.distanceKm,
      },
    },
  ];

  const p90Delta = Math.max(
    0,
    assessment.travelTime.p90Minutes - assessment.travelTime.pointMinutes,
  );

  const effects: CausalEffectV1[] = [
    {
      effectId: `effect_p90_${input.problemId}`,
      causeFactIds: [windFactId],
      effectType: 'SEGMENT_TRAVEL_TIME_P90',
      affectedEntityType: 'SEGMENT',
      affectedEntityId: segmentId,
      previousValue: assessment.travelTime.pointMinutes,
      predictedValue: assessment.travelTime.p90Minutes,
      propagationRuleId: 'iceland.wind_to_p90',
      confidence: 0.85,
      explanationKey: CAUSAL_EXPLANATION_KEYS.ICELAND_SEGMENT_P90_INCREASE,
    },
  ];

  if (assessment.missProbability >= 0.1) {
    effects.push({
      effectId: `effect_miss_${input.problemId}`,
      causeFactIds: [`effect_p90_${input.problemId}`],
      effectType: 'APPOINTMENT_MISS_PROBABILITY',
      affectedEntityType: 'BOOKING',
      affectedEntityId: `${input.tripId}:booking:${input.problemId}`,
      predictedValue: assessment.missProbability,
      propagationRuleId: 'iceland.p90_to_miss',
      confidence: 0.8,
      explanationKey: CAUSAL_EXPLANATION_KEYS.ICELAND_APPOINTMENT_MISS_RISK,
    });
  }

  const severity =
    assessment.missProbability >= 0.5
      ? 'BLOCKER'
      : assessment.missProbability >= 0.2 || p90Delta >= 20
        ? 'WARNING'
        : 'INFO';

  return {
    facts,
    effects,
    problem: {
      problemId: input.problemId,
      problemType: 'TRANSPORT_BUFFER',
      severity,
      assessmentKey: assessment.userFacingAssessment,
    },
    assessment,
  };
}

export function isTravelOrTransportProblem(input: {
  semanticKey?: string;
  type?: string;
  dimension?: string;
}): boolean {
  const hay = `${input.semanticKey ?? ''} ${input.type ?? ''} ${input.dimension ?? ''}`.toLowerCase();
  return (
    hay.includes('travel') ||
    hay.includes('transport') ||
    hay.includes('buffer') ||
    hay.includes('same_day')
  );
}

function parseDistanceKm(text: string): number | undefined {
  const m = text.match(/([\d.]+)\s*km/i);
  return m ? Number(m[1]) : undefined;
}

function parseDurationMinutes(text: string): number | undefined {
  const m = text.match(/([\d.]+)\s*分钟/);
  return m ? Number(m[1]) : undefined;
}

export function extractTravelHintsFromMessage(message?: string): {
  distanceKm?: number;
  durationMinutes?: number;
  routeLabel?: string;
} {
  if (!message?.trim()) return {};
  const arrow = message.match(/([^·→]+→[^（(]+)/);
  return {
    distanceKm: parseDistanceKm(message),
    durationMinutes: parseDurationMinutes(message),
    routeLabel: arrow?.[1]?.trim(),
  };
}
