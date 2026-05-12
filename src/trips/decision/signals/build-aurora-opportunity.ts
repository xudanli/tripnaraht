/**
 * 由 AuroraNightObservationSignal 推导 AuroraOpportunitySignal（纯函数）。
 *
 * 区分「能否看见头顶的天空」与「是否值得为极光调整夜间机动」。
 */

import type { ISODate } from '../world-model';
import type { AuroraNightObservationSignal } from './aurora-night-signals.types';
import type {
  AuroraMobilityRecommendation,
  AuroraObservationTier,
  AuroraOpportunitySignal,
} from './aurora-opportunity-signals.types';

/** 雷克雅未克市区近似包围盒（单锚点云图时的走廊启发） */
function isNearReykjavikUrban(lat?: number, lng?: number): boolean {
  if (lat === undefined || lng === undefined) {
    return false;
  }
  return lat >= 64.05 && lat <= 64.22 && lng >= -22.05 && lng <= -21.55;
}

function kpScore(kp: number): number {
  return Math.max(0, Math.min(1, kp / 6));
}

function skyScore(
  cloudPct: number | undefined,
  visibility: AuroraNightObservationSignal['visibility'],
): number {
  const cloud = Math.min(100, Math.max(0, cloudPct ?? 50));
  const clear = (100 - cloud) / 100;
  const visW =
    visibility === 'high'
      ? 0.98
      : visibility === 'moderate'
        ? 0.72
        : visibility === 'low'
          ? 0.42
          : 0.08;
  return Math.max(0, Math.min(1, clear * visW));
}

function tierFromScore(score: number): AuroraObservationTier {
  if (score >= 0.82) {
    return 'EXCEPTIONAL';
  }
  if (score >= 0.62) {
    return 'HIGH';
  }
  if (score >= 0.38) {
    return 'MEDIUM';
  }
  return 'LOW';
}

function mobilityHint(
  score: number,
  sky: number,
  kpS: number,
  night: AuroraNightObservationSignal,
): {
  mobility: AuroraMobilityRecommendation;
  regions: string[] | undefined;
} {
  const blocked = night.observationFeasibility === 'blocked';
  const marginal = night.observationFeasibility === 'marginal';
  const urban = isNearReykjavikUrban(night.resolvedLat, night.resolvedLng);

  if (blocked && urban) {
    return {
      mobility: 'MOVE_SOUTH',
      regions: ['south_coast', 'vik_corridor', 'jokulsarlon_east'],
    };
  }

  if (
    (marginal || sky < 0.48) &&
    kpS >= 0.55 &&
    urban &&
    score >= 0.42
  ) {
    return {
      mobility: 'MOVE_SOUTH',
      regions: ['south_coast', 'vik', 'skogafoss_corridor'],
    };
  }

  if (
    night.cloudCoveragePct !== undefined &&
    night.cloudCoveragePct > 78 &&
    night.resolvedLat !== undefined &&
    night.resolvedLat < 64.45
  ) {
    return {
      mobility: 'MOVE_INLAND',
      regions: ['golden_circle_inland', 'thingvellir_corridor'],
    };
  }

  if (blocked && !urban) {
    return { mobility: 'STAY', regions: undefined };
  }

  return { mobility: 'STAY', regions: undefined };
}

function observationWindowForTier(
  tier: AuroraObservationTier,
): { start: string; end: string } | undefined {
  if (tier === 'LOW') {
    return undefined;
  }
  return { start: '22:30', end: '02:00' };
}

export function buildAuroraOpportunitySignal(
  date: ISODate,
  night: AuroraNightObservationSignal,
): AuroraOpportunitySignal {
  const kpS = kpScore(night.kpIndex);
  const sky = skyScore(night.cloudCoveragePct, night.visibility);
  let opportunityScore = 0.55 * kpS + 0.45 * sky;

  if (night.observationFeasibility === 'blocked') {
    opportunityScore = Math.min(opportunityScore, 0.34);
  } else if (night.observationFeasibility === 'marginal') {
    opportunityScore *= 0.92;
  }

  opportunityScore = Math.max(0, Math.min(1, opportunityScore));

  const tier = tierFromScore(opportunityScore);
  const { mobility, regions } = mobilityHint(
    opportunityScore,
    sky,
    kpS,
    night,
  );

  const hasNumbers =
    typeof night.cloudCoveragePct === 'number' &&
    typeof night.kpIndex === 'number';
  const confidence =
    hasNumbers && night.resolvedLat !== undefined ? 0.82 : hasNumbers ? 0.68 : 0.52;

  return {
    date,
    opportunityScore,
    confidence,
    recommendedObservationWindow: observationWindowForTier(tier),
    mobilityRecommendation: mobility,
    regionalPreference: regions,
    observationTier: tier,
  };
}

export function buildAuroraOpportunityByDate(
  auroraByDate: Partial<Record<ISODate, AuroraNightObservationSignal>>,
): Partial<Record<ISODate, AuroraOpportunitySignal>> {
  const out: Partial<Record<ISODate, AuroraOpportunitySignal>> = {};
  for (const date of Object.keys(auroraByDate)) {
    const sig = auroraByDate[date];
    if (!sig) {
      continue;
    }
    out[date] = buildAuroraOpportunitySignal(date, sig);
  }
  return out;
}

/**  horizon 内机会排序（追逐窗 / Abu 候选扩展用） */
export function rankAuroraOpportunityDates(
  opportunityByDate: Partial<Record<ISODate, AuroraOpportunitySignal>>,
): ISODate[] {
  return Object.entries(opportunityByDate)
    .filter(([, v]) => v !== undefined)
    .sort((a, b) => (b[1]!.opportunityScore ?? 0) - (a[1]!.opportunityScore ?? 0))
    .map(([d]) => d as ISODate);
}
