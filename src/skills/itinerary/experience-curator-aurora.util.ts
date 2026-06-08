/**
 * 体验策划 — 极光 Kp 实时窗与观测机会文案
 */

import type { IcelandAuroraAdapter } from '../../data-contracts/adapters/iceland-aurora.adapter';
import { buildAuroraOpportunitySignal } from '../../trips/decision/signals/build-aurora-opportunity';
import {
  buildAuroraNightObservationSignal,
} from '../../trips/decision/signals/build-night-observation-feasibility';
import type { AuroraNightObservationSignal } from '../../trips/decision/signals/aurora-night-signals.types';
import type { AuroraOpportunitySignal } from '../../trips/decision/signals/aurora-opportunity-signals.types';

type AuroraByDateMap = Partial<Record<string, AuroraNightObservationSignal>>;

function readAuroraByDateFromResearch(
  researchData?: Record<string, unknown>,
): AuroraByDateMap {
  if (!researchData) return {};
  const signals = researchData.signals;
  if (signals && typeof signals === 'object') {
    const fromSignals = (signals as { auroraByDate?: AuroraByDateMap }).auroraByDate;
    if (fromSignals && typeof fromSignals === 'object') return fromSignals;
  }
  const direct = researchData.auroraByDate;
  if (direct && typeof direct === 'object') return direct as AuroraByDateMap;
  return {};
}

export interface ExperienceAuroraContext {
  dateIso: string;
  night: AuroraNightObservationSignal;
  opportunity: AuroraOpportunitySignal;
  liveFetched: boolean;
}

const MOBILITY_ZH: Record<string, string> = {
  STAY: '就地守候',
  MOVE_SOUTH: '建议南下低云走廊',
  MOVE_INLAND: '建议内陆净空区',
};

const TIER_ZH: Record<string, string> = {
  EXCEPTIONAL: '极佳',
  HIGH: '较好',
  MEDIUM: '中等',
  LOW: '偏低',
};

export async function resolveExperienceAuroraContext(params: {
  dateIso: string;
  lat: number;
  lng: number;
  researchData?: Record<string, unknown>;
  auroraAdapter?: IcelandAuroraAdapter;
  preferLive?: boolean;
}): Promise<ExperienceAuroraContext | undefined> {
  const dateIso = params.dateIso.slice(0, 10);
  const cached = readAuroraByDateFromResearch(params.researchData)[dateIso];

  if (cached && params.preferLive !== true) {
    return {
      dateIso,
      night: cached,
      opportunity: buildAuroraOpportunitySignal(dateIso, cached),
      liveFetched: false,
    };
  }

  if (!params.auroraAdapter) {
    if (cached) {
      return {
        dateIso,
        night: cached,
        opportunity: buildAuroraOpportunitySignal(dateIso, cached),
        liveFetched: false,
      };
    }
    return undefined;
  }

  try {
    const kp = await params.auroraAdapter.getAuroraKPIndex();
    const cloud = await params.auroraAdapter.getCloudCover(params.lat, params.lng);
    const visibility = await params.auroraAdapter.calculateAuroraVisibility(
      params.lat,
      params.lng,
      kp,
      cloud,
    );
    const night = buildAuroraNightObservationSignal({
      kpIndex: kp,
      cloudCoveragePct: cloud,
      visibility,
      resolvedLat: params.lat,
      resolvedLng: params.lng,
      source: 'iceland_aurora_adapter',
      updatedAt: new Date().toISOString(),
    });
    return {
      dateIso,
      night,
      opportunity: buildAuroraOpportunitySignal(dateIso, night),
      liveFetched: true,
    };
  } catch {
    if (cached) {
      return {
        dateIso,
        night: cached,
        opportunity: buildAuroraOpportunitySignal(dateIso, cached),
        liveFetched: false,
      };
    }
    return undefined;
  }
}

export function buildAuroraCurationNotes(ctx: ExperienceAuroraContext): string[] {
  const notes: string[] = [];
  const { night, opportunity } = ctx;
  const kp = night.kpIndex;
  const cloud = night.cloudCoveragePct;
  const tier = TIER_ZH[opportunity.observationTier] ?? opportunity.observationTier;
  const window = opportunity.recommendedObservationWindow;

  let headline = `极光实时窗：Kp=${kp.toFixed(1)}`;
  if (typeof cloud === 'number') headline += `，云量约 ${Math.round(cloud)}%`;
  headline += `，机会档位 ${tier}`;
  if (ctx.liveFetched) headline += '（实时拉取）';
  notes.push(headline);

  if (window && opportunity.observationTier !== 'LOW') {
    notes.push(
      `推荐守候时段 ${window.start}–${window.end}；能见度 ${night.visibility}，可行性 ${night.observationFeasibility}。`,
    );
  } else if (kp >= 4) {
    notes.push('磁活动偏强：若晚间云量下降，宜保留低光害走廊并预留 22:30 后机动时间。');
  } else if (night.observationFeasibility === 'blocked') {
    notes.push('当晚云层或磁活动不利，不建议为极光大幅挪动日间骨架。');
  }

  const mobility = opportunity.mobilityRecommendation;
  if (mobility && mobility !== 'STAY') {
    const hint = MOBILITY_ZH[mobility] ?? mobility;
    const regions = opportunity.regionalPreference?.join('、');
    notes.push(regions ? `${hint}（${regions}）` : hint);
  }

  return notes;
}
