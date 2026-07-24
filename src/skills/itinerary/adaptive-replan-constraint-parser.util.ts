/**
 * Stage 1: CONSTRAINT PARSING — 天气/路况/人格 → 约束权重与预调整
 */

import type { Itinerary, RequiredAdjustment } from '../../agent/interfaces/trip-plan.interface';
import type {
  AdaptiveReplanEnvironmentalContext,
  ConstraintParseResult,
  OdysseyPersonaSnapshot,
  TrafficMatrixEntry,
  WeatherSnapshot,
} from './adaptive-replan.types';
import { buildPersonaConstraintWeights } from './adaptive-replan-persona.util';

const OUTDOOR_POI_KEYWORDS =
  /黑沙滩|冰洞|冰川|瀑布|徒步|观鸟|高地|沙滩|峡湾|户外|露营|火山|地热步道|钻石海滩/i;

const INDOOR_POI_KEYWORDS = /博物馆|温泉|室内|咖啡馆|咖啡|餐厅|展馆|水族馆/i;

const SEVERE_WEATHER =
  /暴雨|大雨|暴雪|暴风|强风|大风|冰雹|极端|blizzard|heavy.?rain|storm|gale/i;

function isOutdoorPoi(name: string, notes?: string): boolean {
  const text = `${name} ${notes ?? ''}`;
  if (INDOOR_POI_KEYWORDS.test(text)) return false;
  return OUTDOOR_POI_KEYWORDS.test(text);
}

function isIndoorPoi(name: string, notes?: string): boolean {
  return INDOOR_POI_KEYWORDS.test(`${name} ${notes ?? ''}`);
}

function weatherForDay(
  forecast: WeatherSnapshot[] | undefined,
  dateIso: string,
): WeatherSnapshot | undefined {
  return forecast?.find((w) => w.date_iso === dateIso);
}

function isSevereWeather(snapshot: WeatherSnapshot | undefined): boolean {
  if (!snapshot) return false;
  if (snapshot.severity === 'high' || snapshot.severity === 'extreme') return true;
  return SEVERE_WEATHER.test(snapshot.condition);
}

/** 路况干扰：通行时间超过建议停留 50% 时标记降级候选 */
export function computeTrafficReachabilityDemotion(
  baseDriveMinutes: number,
  trafficFactor: number,
  suggestedStayMinutes: number,
): boolean {
  const effectiveDrive = baseDriveMinutes * trafficFactor;
  return effectiveDrive > suggestedStayMinutes * 0.5;
}

function collectBlockedSegments(traffic?: TrafficMatrixEntry[]): TrafficMatrixEntry[] {
  return (traffic ?? []).filter((e) => e.blocked === true);
}

function buildWeatherSwapAdjustments(
  itinerary: Itinerary,
  targetDayNumbers: number[],
  env: AdaptiveReplanEnvironmentalContext | undefined,
  weatherTolerance: 'low' | 'medium' | 'high',
): {
  weatherRiskByDay: ConstraintParseResult['weatherRiskByDay'];
  adjustments: RequiredAdjustment[];
} {
  const weatherRiskByDay: ConstraintParseResult['weatherRiskByDay'] = {};
  const adjustments: RequiredAdjustment[] = [];

  if (weatherTolerance === 'high') {
    return { weatherRiskByDay, adjustments };
  }

  for (let i = 0; i < itinerary.days.length; i++) {
    const dayNumber = i + 1;
    if (!targetDayNumbers.includes(dayNumber)) continue;

    const day = itinerary.days[i];
    const wx = weatherForDay(env?.weatherForecast, day.date);
    if (!isSevereWeather(wx)) continue;

    const outdoorItems = day.items.filter(
      (it) => it.type === 'POI' && isOutdoorPoi(it.location_ref.name, it.notes),
    );
    const indoorItems = day.items.filter(
      (it) => it.type === 'POI' && isIndoorPoi(it.location_ref.name, it.notes),
    );

    const risks: Array<{ item_id?: string; poi_name: string; risk: string }> = [];
    for (const outdoor of outdoorItems) {
      risks.push({
        item_id: outdoor.id,
        poi_name: outdoor.location_ref.name,
        risk: `恶劣天气（${wx?.condition ?? '未知'}）下户外 POI 高风险`,
      });

      if (indoorItems.length > 0 && weatherTolerance === 'low') {
        adjustments.push({
          action: 'REPLACE_POI',
          target: outdoor.id,
          why: `天气恶劣：建议将「${outdoor.location_ref.name}」与室内 POI「${indoorItems[0].location_ref.name}」调换时段`,
        });
      } else if (weatherTolerance === 'medium') {
        adjustments.push({
          action: 'REPLACE_POI',
          target: outdoor.id,
          why: `天气恶劣：建议替换或移除户外 POI「${outdoor.location_ref.name}」`,
        });
      }
    }

    if (risks.length) {
      weatherRiskByDay[day.date] = risks;
    }
  }

  return { weatherRiskByDay, adjustments };
}

export function parseAdaptiveReplanConstraints(params: {
  itinerary: Itinerary;
  targetDays: number[];
  personaSnapshot: OdysseyPersonaSnapshot;
  environmentalContext?: AdaptiveReplanEnvironmentalContext;
}): ConstraintParseResult {
  const weights = buildPersonaConstraintWeights(params.personaSnapshot);
  const blockedSegments = collectBlockedSegments(params.environmentalContext?.trafficStatus);

  const { weatherRiskByDay, adjustments: weatherAdjustments } = buildWeatherSwapAdjustments(
    params.itinerary,
    params.targetDays,
    params.environmentalContext,
    weights.weatherTolerance,
  );

  const trafficAdjustments: RequiredAdjustment[] = [];
  for (const seg of params.environmentalContext?.trafficStatus ?? []) {
    if (seg.blocked) {
      trafficAdjustments.push({
        action: 'CHANGE_TRANSPORT',
        why: seg.block_reason ?? '路段封禁，需改道或移除受影响 POI',
      });
    } else if (seg.traffic_factor > 1.3 * weights.trafficFactorMultiplier) {
      trafficAdjustments.push({
        action: 'ADD_BUFFER',
        why: `路况拥堵：路段通行 buffer 乘以 ${seg.traffic_factor.toFixed(2)}`,
      });
    }
  }

  return {
    weights,
    weatherRiskByDay,
    blockedSegments,
    adjustments: [...weatherAdjustments, ...trafficAdjustments],
  };
}
