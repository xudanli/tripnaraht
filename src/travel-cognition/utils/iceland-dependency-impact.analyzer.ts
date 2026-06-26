/**
 * 冰岛核心场景级联影响分析 — 封路 / F-road / 天气窗口。
 */

import {
  ICELAND_FROAD_CASCADE_GRAPH_VERSION,
  ICELAND_ROAD_CASCADE_GRAPH_VERSION,
  ICELAND_WEATHER_CASCADE_GRAPH_VERSION,
} from '../graphs/iceland-cascade-graph.v0';
import type { EvidenceEnvelope } from '../types/evidence-envelope.types';
import { assessEvidenceFreshness } from '../types/evidence-envelope.types';
import type {
  ImpactRecommendationKind,
  ImpactRiskLevel,
  TravelDependencyImpact,
} from '../types/dependency-graph.types';
import type { TravelEntityRef } from '../types/travel-entity-ref.types';
import { DEFAULT_NON_TRANSACTION_DISCLOSURE_ZH } from '../types/coverage-disclosure.types';
import type { TripDependencyChainNode } from './trip-dependency-chain.util';
import { withCascadeHop } from './cascade-confidence.util';

/** 与 data-contracts RoadStatus 对齐的最小值形状 */
export interface RoadStatusValue {
  isOpen?: boolean;
  riskLevel?: 0 | 1 | 2 | 3;
  reason?: string;
  source?: string;
  fRoadInfo?: { roadId?: string; name?: string; seasonOpen?: boolean };
  metadata?: Record<string, unknown>;
}

export interface WeatherWindowValue {
  condition?: string;
  windSpeed?: number;
  visibility?: number;
  alerts?: Array<{ type?: string; severity?: string; title?: string }>;
  maxWindSpeed?: number;
  precipitationSum?: number;
  weatherCode?: number;
  metadata?: Record<string, unknown>;
}

export interface AnalyzeIcelandCascadeInput {
  trigger: EvidenceEnvelope<RoadStatusValue | WeatherWindowValue>;
  chain: TripDependencyChainNode[];
  locale?: 'zh' | 'en';
  nowMs?: number;
}

function maxRisk(a: ImpactRiskLevel, b: ImpactRiskLevel): ImpactRiskLevel {
  const order: ImpactRiskLevel[] = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
  return order.indexOf(a) >= order.indexOf(b) ? a : b;
}

function buildImpactNode(params: {
  entityRef: TravelEntityRef;
  riskLevel: ImpactRiskLevel;
  message: string;
  recommendation: ImpactRecommendationKind;
  userConfirmationRequired?: string[];
  rootConfidence: number;
  hopDepth: number;
}) {
  return withCascadeHop(
    {
      entityRef: params.entityRef,
      riskLevel: params.riskLevel,
      message: params.message,
      recommendation: params.recommendation,
      userConfirmationRequired: params.userConfirmationRequired,
    },
    params.rootConfidence,
    params.hopDepth,
  );
}

function recommendationForRisk(risk: ImpactRiskLevel, forceAsk = false): ImpactRecommendationKind {
  if (forceAsk || risk === 'CRITICAL') return 'ASK_USER';
  if (risk === 'HIGH') return 'ADJUST';
  if (risk === 'MEDIUM') return 'REPLACE';
  return 'DELAY';
}

function staleNote(fresh: ReturnType<typeof assessEvidenceFreshness>, locale: 'zh' | 'en'): string {
  if (fresh.strongJudgmentAllowed) return '';
  return locale === 'zh'
    ? '（路况/天气数据可能已过期，以下影响仅供参考）'
    : ' (road/weather data may be stale; impact is indicative only)';
}

export function isFroadRoadStatus(road: RoadStatusValue): boolean {
  const meta = road.metadata ?? {};
  if (meta.isFroad === true || meta.fRoad === true || meta.roadType === 'F') return true;
  if (road.fRoadInfo) return true;
  const reason = String(road.reason ?? '');
  return /\bf[- ]?road\b/i.test(reason) || /\bF\d{3}\b/i.test(reason);
}

export function isRoadClosureBlocking(road: RoadStatusValue): boolean {
  if (road.isOpen === false) return true;
  const risk = Number(road.riskLevel ?? 0);
  return risk >= 2;
}

function isWeatherWindowBlocking(weather: WeatherWindowValue): boolean {
  const wind = Math.max(Number(weather.windSpeed ?? 0), Number(weather.maxWindSpeed ?? 0));
  const visibility = Number(weather.visibility ?? Infinity);
  const precip = Number(weather.precipitationSum ?? 0);
  const alerts = weather.alerts ?? [];
  const criticalAlert = alerts.some((a) =>
    ['critical', 'warning'].includes(String(a.severity ?? '').toLowerCase()),
  );
  const condition = String(weather.condition ?? '').toLowerCase();
  return (
    criticalAlert ||
    wind >= 18 ||
    (visibility < 500 && Number.isFinite(visibility)) ||
    precip >= 15 ||
    ['storm', 'blizzard', 'ice', 'snow'].some((k) => condition.includes(k))
  );
}

function weatherRiskLevel(weather: WeatherWindowValue): ImpactRiskLevel {
  const wind = Math.max(Number(weather.windSpeed ?? 0), Number(weather.maxWindSpeed ?? 0));
  if (wind >= 25) return 'CRITICAL';
  if (wind >= 18) return 'HIGH';
  const visibility = Number(weather.visibility ?? Infinity);
  if (visibility < 200 && Number.isFinite(visibility)) return 'HIGH';
  if (wind >= 12 || Number(weather.precipitationSum ?? 0) >= 10) return 'MEDIUM';
  return 'LOW';
}

export function analyzeRoadClosureCascade(
  input: AnalyzeIcelandCascadeInput & { trigger: EvidenceEnvelope<RoadStatusValue> },
): TravelDependencyImpact {
  const locale = input.locale ?? 'zh';
  const road = (input.trigger.value ?? {}) as RoadStatusValue;
  const rootEntity = input.trigger.entityRef;
  const freshness = assessEvidenceFreshness(input.trigger, input.nowMs);
  const rootConfidence = freshness.strongJudgmentAllowed
    ? input.trigger.confidence
    : input.trigger.confidence * 0.7;
  const note = staleNote(freshness, locale);
  const froad = isFroadRoadStatus(road);
  const blocking = isRoadClosureBlocking(road);

  if (!blocking) {
    return {
      rootEntity,
      rootFactType: 'ROAD',
      affected: [],
      rootConfidence,
      coverageHint: DEFAULT_NON_TRANSACTION_DISCLOSURE_ZH,
    };
  }

  const baseRisk: ImpactRiskLevel = froad ? 'CRITICAL' : road.riskLevel === 3 ? 'HIGH' : 'MEDIUM';
  const reasonLabel = String(road.reason ?? (froad ? 'F-road closed' : 'Road closed'));
  const affected: TravelDependencyImpact['affected'] = [];

  const drives = input.chain.filter((n) => n.role === 'drive');
  const relevantDrives = froad ? drives.filter((d) => d.isFroad) : drives;

  for (const drive of relevantDrives.length > 0 ? relevantDrives : drives.slice(0, 3)) {
    const risk = froad && drive.isFroad ? 'CRITICAL' : baseRisk;
    affected.push(
      buildImpactNode({
        entityRef: drive.entityRef,
        riskLevel: risk,
        message:
          locale === 'zh'
            ? `${froad ? 'F-road 封路' : '道路封闭'}（${reasonLabel}），驾车段「${drive.label ?? drive.entityRef.id}」可能无法通行${note}`
            : `${froad ? 'F-road closure' : 'Road closure'} (${reasonLabel}); drive segment may be blocked${note}`,
        recommendation: recommendationForRisk(risk, froad),
        userConfirmationRequired:
          froad && locale === 'zh'
            ? ['请确认车辆是否允许进入 F-road', '请自行查询 road.is 最新状态']
            : froad
              ? ['Confirm vehicle F-road eligibility', 'Check road.is for latest status']
              : locale === 'zh'
                ? ['请自行确认绕行路线是否可行']
                : ['Confirm alternate route yourself'],
        rootConfidence,
        hopDepth: 1,
      }),
    );
  }

  const driveDays = new Set(relevantDrives.map((d) => d.dayDate).filter(Boolean));
  const pois = input.chain.filter((n) => n.role === 'poi');
  for (const poi of pois) {
    if (driveDays.size > 0 && poi.dayDate && !driveDays.has(poi.dayDate)) continue;
    const risk = froad ? maxRisk(baseRisk, 'HIGH') : baseRisk;
    affected.push(
      buildImpactNode({
        entityRef: poi.entityRef,
        riskLevel: risk,
        message:
          locale === 'zh'
            ? `上游路段受阻，POI「${poi.label ?? poi.entityRef.label}」可能无法按计划抵达${note}`
            : `Upstream road blocked; POI may be unreachable${note}`,
        recommendation: recommendationForRisk(risk),
        rootConfidence,
        hopDepth: 2,
      }),
    );
  }

  for (const day of input.chain.filter((n) => n.role === 'day_plan')) {
    if (driveDays.size > 0 && day.dayDate && !driveDays.has(day.dayDate)) continue;
    affected.push(
      buildImpactNode({
        entityRef: day.entityRef,
        riskLevel: maxRisk(baseRisk, 'MEDIUM'),
        message:
          locale === 'zh'
            ? `当日路线「${day.label ?? day.dayDate}」需整体调整顺序或改期${note}`
            : `Day plan may require reordering or rescheduling${note}`,
        recommendation: froad ? 'ASK_USER' : 'ADJUST',
        rootConfidence,
        hopDepth: 3,
      }),
    );
  }

  if (affected.length === 0) {
    affected.push(
      buildImpactNode({
        entityRef: rootEntity,
        riskLevel: baseRisk,
        message:
          locale === 'zh'
            ? `${froad ? 'F-road' : '道路'}状态异常（${reasonLabel}），当前行程链未匹配到具体驾车段${note}`
            : `Road status abnormal; no matching drive segments in chain${note}`,
        recommendation: recommendationForRisk(baseRisk, froad),
        rootConfidence,
        hopDepth: 0,
      }),
    );
  }

  return {
    rootEntity,
    rootFactType: 'ROAD',
    affected,
    rootConfidence,
    coverageHint: DEFAULT_NON_TRANSACTION_DISCLOSURE_ZH,
  };
}

export function analyzeFroadClosureCascade(
  input: AnalyzeIcelandCascadeInput & { trigger: EvidenceEnvelope<RoadStatusValue> },
): TravelDependencyImpact {
  return analyzeRoadClosureCascade(input);
}

export function analyzeWeatherWindowCascade(
  input: AnalyzeIcelandCascadeInput & { trigger: EvidenceEnvelope<WeatherWindowValue> },
): TravelDependencyImpact {
  const locale = input.locale ?? 'zh';
  const weather = (input.trigger.value ?? {}) as WeatherWindowValue;
  const rootEntity = input.trigger.entityRef;
  const freshness = assessEvidenceFreshness(input.trigger, input.nowMs);
  const rootConfidence = freshness.strongJudgmentAllowed
    ? input.trigger.confidence
    : input.trigger.confidence * 0.7;
  const note = staleNote(freshness, locale);

  if (!isWeatherWindowBlocking(weather)) {
    return {
      rootEntity,
      rootFactType: 'WEATHER',
      affected: [],
      rootConfidence,
      coverageHint: DEFAULT_NON_TRANSACTION_DISCLOSURE_ZH,
    };
  }

  const baseRisk = weatherRiskLevel(weather);
  const wind = Math.max(Number(weather.windSpeed ?? 0), Number(weather.maxWindSpeed ?? 0));
  const affected: TravelDependencyImpact['affected'] = [];

  const outdoorPois = input.chain.filter(
    (n) => n.role === 'poi' && (n.exposure === 'outdoor' || n.exposure === 'mixed' || !n.exposure),
  );

  for (const poi of outdoorPois) {
    const risk = maxRisk(baseRisk, poi.exposure === 'outdoor' ? baseRisk : 'MEDIUM');
    affected.push(
      buildImpactNode({
        entityRef: poi.entityRef,
        riskLevel: risk,
        message:
          locale === 'zh'
            ? `天气窗口不利（风速约 ${Math.round(wind)} m/s），户外 POI「${poi.label ?? poi.entityRef.label}」执行风险升高${note}`
            : `Adverse weather (~${Math.round(wind)} m/s wind); outdoor POI risk elevated${note}`,
        recommendation: recommendationForRisk(risk),
        userConfirmationRequired:
          risk === 'CRITICAL' || risk === 'HIGH'
            ? locale === 'zh'
              ? ['请自行确认是否取消或改期户外活动']
              : ['Confirm cancelling or rescheduling outdoor activities yourself']
            : undefined,
        rootConfidence,
        hopDepth: 1,
      }),
    );
  }

  const poiDays = new Set(outdoorPois.map((p) => p.dayDate).filter(Boolean));
  for (const day of input.chain.filter((n) => n.role === 'day_plan')) {
    if (poiDays.size > 0 && day.dayDate && !poiDays.has(day.dayDate)) continue;
    if (outdoorPois.length === 0) continue;
    affected.push(
      buildImpactNode({
        entityRef: day.entityRef,
        riskLevel: maxRisk(baseRisk, 'MEDIUM'),
        message:
          locale === 'zh'
            ? `当日「${day.label ?? day.dayDate}」含户外项，建议压缩或 indoor 替代${note}`
            : `Day includes outdoor items; consider compression or indoor alternatives${note}`,
        recommendation: 'ADJUST',
        rootConfidence,
        hopDepth: 2,
      }),
    );
  }

  if (affected.length === 0) {
    affected.push(
      buildImpactNode({
        entityRef: rootEntity,
        riskLevel: baseRisk,
        message:
          locale === 'zh'
            ? `天气条件不利（风速约 ${Math.round(wind)} m/s），当前行程链未检测到户外 POI${note}`
            : `Adverse weather; no outdoor POIs detected in chain${note}`,
        recommendation: 'DELAY',
        rootConfidence,
        hopDepth: 0,
      }),
    );
  }

  return {
    rootEntity,
    rootFactType: 'WEATHER',
    affected,
    rootConfidence,
    coverageHint: DEFAULT_NON_TRANSACTION_DISCLOSURE_ZH,
  };
}

export function getIcelandCascadeGraphVersion(factType: 'ROAD' | 'WEATHER', froad?: boolean): string {
  if (factType === 'ROAD' && froad) return ICELAND_FROAD_CASCADE_GRAPH_VERSION;
  if (factType === 'ROAD') return ICELAND_ROAD_CASCADE_GRAPH_VERSION;
  return ICELAND_WEATHER_CASCADE_GRAPH_VERSION;
}
