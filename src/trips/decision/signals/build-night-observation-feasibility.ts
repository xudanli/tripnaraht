/**
 * 由 AuroraNightObservationSignal + TripPlan 推导夜间观测可行性摘要（纯函数，可单测）。
 */

import type { TripPlan } from '../plan-model';
import type { ISODate } from '../world-model';
import type {
  AuroraNightObservationSignal,
  NightObservationFeasibilitySignalSummary,
} from './aurora-night-signals.types';
import { parseIsoTimeToMinutes } from '../utils/weather-slot-delay.util';

const AURORA_TAGS = new Set(['aurora_night', 'night_observation', 'aurora']);

/** 未打标签时，晚间户外槽位的粗略启发（21:00 后视为潜在极光窗） */
const NIGHT_START_MIN = 21 * 60;

function slotLooksLikeNightObservation(slot: {
  time: string;
  semanticTags?: string[];
  type?: string;
}): boolean {
  if (slot.semanticTags?.some(t => AURORA_TAGS.has(t))) {
    return true;
  }
  const start = parseIsoTimeToMinutes(slot.time);
  const isEveningNature =
    (slot.type === 'nature' || slot.type === 'sightseeing') && start >= NIGHT_START_MIN;
  return isEveningNature;
}

/**
 * 由适配器 visibility + 云量推导 observationFeasibility（与 IcelandAuroraAdapter 阈值大致对齐）。
 */
export function deriveObservationFeasibility(
  visibility: AuroraNightObservationSignal['visibility'],
  cloudCoveragePct?: number,
): AuroraNightObservationSignal['observationFeasibility'] {
  const cloud = cloudCoveragePct ?? 50;
  if (visibility === 'none' || cloud > 70) {
    return 'blocked';
  }
  if (visibility === 'low' || cloud > 50) {
    return 'marginal';
  }
  return 'feasible';
}

/**
 * 将 KP/云/visibility 打成结构化信号（供写入 ExternalSignalsState.auroraByDate）。
 */
export function buildAuroraNightObservationSignal(input: {
  kpIndex: number;
  cloudCoveragePct?: number;
  solarWindKms?: number;
  visibility: AuroraNightObservationSignal['visibility'];
  resolvedLat?: number;
  resolvedLng?: number;
  source?: string;
  updatedAt?: string;
}): AuroraNightObservationSignal {
  const observationFeasibility = deriveObservationFeasibility(
    input.visibility,
    input.cloudCoveragePct,
  );
  let auroraProbability: number | undefined;
  if (input.visibility === 'high') {
    auroraProbability = 0.85;
  } else if (input.visibility === 'moderate') {
    auroraProbability = 0.55;
  } else if (input.visibility === 'low') {
    auroraProbability = 0.25;
  } else {
    auroraProbability = 0.05;
  }

  return {
    kpIndex: input.kpIndex,
    cloudCoveragePct: input.cloudCoveragePct,
    solarWindKms: input.solarWindKms,
    auroraProbability,
    visibility: input.visibility,
    observationFeasibility,
    resolvedLat: input.resolvedLat,
    resolvedLng: input.resolvedLng,
    source: input.source,
    updatedAt: input.updatedAt ?? new Date().toISOString(),
  };
}

export function buildNightObservationFeasibilitySummary(
  plan: TripPlan,
  auroraByDate: Partial<Record<ISODate, AuroraNightObservationSignal>>,
): NightObservationFeasibilitySignalSummary {
  const infeasibleAuroraSlotIds: string[] = [];
  const blockedObservationDates: ISODate[] = [];
  const notes: string[] = [];

  for (const day of plan.days) {
    const sig = auroraByDate[day.date];
    if (!sig) {
      continue;
    }
    if (sig.observationFeasibility !== 'blocked') {
      continue;
    }
    blockedObservationDates.push(day.date);

    for (const slot of day.timeSlots) {
      if (!slotLooksLikeNightObservation(slot)) {
        continue;
      }
      infeasibleAuroraSlotIds.push(slot.id);
    }
  }

  if (blockedObservationDates.length > 0) {
    notes.push(
      '极光夜间观测因 KP/云层在该解析点不可行：可考虑跳过可选夜间段、换至南岸（如 Vik）过夜或改日。',
    );
  }

  return {
    infeasibleAuroraSlotIds,
    blockedObservationDates,
    notes: notes.length ? notes : undefined,
  };
}
