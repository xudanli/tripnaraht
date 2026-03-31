import type { Itinerary, ItineraryItem, TripPlanRequest } from '../../agent/interfaces/trip-plan.interface';
import {
  DEFAULT_TEMPLATE_CONFIG,
  getDynamicCityTemplateOverrides,
  type FallbackStrategy,
  type FallbackTemplateConfig,
} from './fallback-templates.config';
import type { WorldPoiRecord } from './poi-world-model.mock';
import {
  computeScheduleScore,
  schedulePoiByStrategy,
} from './poi-scheduler-engine';
import { resolveWorldPoisFromSources } from './poi-data-source';

export interface FallbackTimelineItem {
  time: string;
  action: string;
  type: 'start' | 'explore' | 'food' | 'poi' | 'rest' | 'end';
}

export interface FallbackPlan {
  type: 'fallback';
  strategy: 'CITY_WALK' | 'CLASSIC' | 'HOT_SPOTS' | 'BALANCED';
  name?: string;
  timeline: FallbackTimelineItem[];
  confidence: number;
  selected_pois?: string[];
  plan_score?: number;
  explain?: {
    summary: string;
    reasoning: string[];
    objective: string;
  };
  data_source?: 'vector_search' | 'research' | 'mock';
  source_confidence?: number;
  pacing_mode?: 'normal' | 'conservative';
  buffer_minutes?: number;
  commute_matrix?: {
    mode?: 'walk' | 'drive' | 'transit' | 'mixed';
    from_start?: boolean;
    nodes?: string[];
    minutes?: number[][];
  };
}

function resolveTemplate(strategy: FallbackStrategy, destination: string): FallbackTemplateConfig {
  const { overrides } = getDynamicCityTemplateOverrides();
  const key = destination.trim().toLowerCase();
  const cityOverride = overrides[key]?.[strategy] ?? {};
  return {
    ...DEFAULT_TEMPLATE_CONFIG[strategy],
    ...cityOverride,
  };
}

export function getFallbackTemplateVersion(): string {
  return getDynamicCityTemplateOverrides().version;
}

function getConservativeThreshold(): number {
  return getDynamicCityTemplateOverrides().conservativeThreshold;
}

function getBufferMinutes(): number {
  return getDynamicCityTemplateOverrides().bufferMinutes;
}

function addMinutes(hhmm: string, minutes: number): string {
  const [h, m] = hhmm.split(':').map((x) => Number(x));
  const total = h * 60 + m + minutes;
  const normalized = ((total % (24 * 60)) + 24 * 60) % (24 * 60);
  const nh = Math.floor(normalized / 60);
  const nm = normalized % 60;
  return `${String(nh).padStart(2, '0')}:${String(nm).padStart(2, '0')}`;
}

function toRadians(v: number): number {
  return (v * Math.PI) / 180;
}

function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const earthRadius = 6371;
  const dLat = toRadians(b.lat - a.lat);
  const dLng = toRadians(b.lng - a.lng);
  const x =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(a.lat)) *
      Math.cos(toRadians(b.lat)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  return earthRadius * (2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x)));
}

function modeSpeedKmh(mode?: 'walk' | 'drive' | 'transit' | 'mixed'): number {
  if (mode === 'walk') return 4.5;
  if (mode === 'drive') return 24;
  if (mode === 'transit') return 16;
  return 10;
}

function estimateCommuteMinutes(
  from: { lat: number; lng: number },
  to: { lat: number; lng: number },
  mode?: 'walk' | 'drive' | 'transit' | 'mixed',
): number {
  const km = haversineKm(from, to);
  const kmh = modeSpeedKmh(mode);
  return Math.max(5, Math.round((km / Math.max(1, kmh)) * 60));
}

function buildCommuteMatrix(
  selectedPois: WorldPoiRecord[],
  mode?: 'walk' | 'drive' | 'transit' | 'mixed',
  startCoordinates?: { lat: number; lng: number },
): FallbackPlan['commute_matrix'] | undefined {
  if (selectedPois.length === 0) return undefined;
  const nodes = selectedPois.map((p) => p.name);
  const n = selectedPois.length;
  const minutes = Array.from({ length: n }, () => Array.from({ length: n }, () => 0));
  for (let i = 0; i < n; i += 1) {
    for (let j = 0; j < n; j += 1) {
      if (i === j) continue;
      minutes[i][j] = estimateCommuteMinutes(
        selectedPois[i].coordinates,
        selectedPois[j].coordinates,
        mode,
      );
    }
  }
  if (!startCoordinates) {
    return { mode, from_start: false, nodes, minutes };
  }
  const startRow = selectedPois.map((p) =>
    estimateCommuteMinutes(startCoordinates, p.coordinates, mode),
  );
  return { mode, from_start: true, nodes: ['START', ...nodes], minutes: [startRow, ...minutes] };
}

function resolvePacingMode(sourceConfidence?: number): 'normal' | 'conservative' {
  const conservativeThreshold = getConservativeThreshold();
  return (sourceConfidence ?? 1) < conservativeThreshold ? 'conservative' : 'normal';
}

function schedulePOI(
  strategy: FallbackStrategy,
  destination: string,
  pois: WorldPoiRecord[],
  sourceConfidence?: number,
  plannerContext?: {
    startCoordinates?: { lat: number; lng: number };
    travelMode?: 'walk' | 'drive' | 'transit' | 'mixed';
    dayWindow?: { start: string; end: string };
    pace?: 'relaxed' | 'moderate' | 'intense';
  },
): FallbackTimelineItem[] {
  const pacingMode = resolvePacingMode(sourceConfidence);
  const scheduled = schedulePoiByStrategy(strategy, pois, {
    sourceConfidence,
    conservativeThreshold: getConservativeThreshold(),
    startCoordinates: plannerContext?.startCoordinates,
    travelMode: plannerContext?.travelMode,
    dayWindow: plannerContext?.dayWindow,
    pace: plannerContext?.pace,
  });
  if (scheduled.length === 0) {
    return [
      { time: '09:00', action: `到达${destination}市中心`, type: 'start' },
      { time: '10:00', action: `探索${destination}核心街区`, type: 'explore' },
      { time: '12:00', action: `${destination}本地午餐`, type: 'food' },
      { time: '15:00', action: `${destination}城市地标参观`, type: 'poi' },
      { time: '19:00', action: `${destination}夜景收尾`, type: 'end' },
    ];
  }
  if (pacingMode === 'conservative') {
    const bufferMinutes = getBufferMinutes();
    const bufferStart = '17:00';
    const nightStart = addMinutes(bufferStart, bufferMinutes);
    return [
      { time: scheduled[0]?.time || '09:00', action: scheduled[0]?.poi.name || `${destination}地标`, type: 'poi' },
      { time: scheduled[1]?.time || '12:00', action: scheduled[1]?.poi.name || '午餐（本地热门餐厅）', type: 'food' },
      { time: scheduled[2]?.time || '15:30', action: scheduled[2]?.poi.name || '核心景点参观', type: 'poi' },
      { time: bufferStart, action: `机动缓冲（交通/休息，${bufferMinutes}分钟）`, type: 'rest' },
      { time: nightStart, action: '夜间收尾（轻量活动）', type: 'end' },
    ];
  }
  return [
    { time: scheduled[0]?.time || '09:00', action: scheduled[0]?.poi.name || `${destination}地标`, type: 'poi' },
    { time: scheduled[1]?.time || '11:30', action: scheduled[1]?.poi.name || '午餐（本地热门餐厅）', type: 'food' },
    { time: scheduled[2]?.time || '14:00', action: scheduled[2]?.poi.name || '选择一个地标景点参观', type: 'poi' },
    { time: '17:00', action: '涩谷咖啡', type: 'rest' },
    { time: scheduled[3]?.time || '19:00', action: scheduled[3]?.poi.name || '晚餐 + 夜景', type: 'end' },
  ];
}

function computePlanScore(timeline: FallbackTimelineItem[], sourceConfidence?: number): number {
  const world: Array<{ time: string; poi: WorldPoiRecord }> = timeline.map((x, i) => ({
    time: x.time,
    poi: {
      id: `tmp-${i}`,
      name: x.action,
      type: x.type === 'food' ? 'food' : x.type === 'rest' ? 'relax' : 'landmark',
      best_time: x.time < '12:00' ? 'morning' : x.time < '18:00' ? 'afternoon' : 'night',
      duration: 60,
      rating: 4.2,
      price_level: 2,
      coordinates: { lat: 0, lng: 0 },
    },
  }));
  return computeScheduleScore(world, sourceConfidence ?? 1);
}

export function chooseFallbackStrategy(userInput: string): FallbackPlan['strategy'] {
  const text = (userInput || '').toLowerCase();
  const score: Record<FallbackStrategy, number> = {
    CITY_WALK: 0.2,
    CLASSIC: 0.2,
    HOT_SPOTS: 0.2,
    BALANCED: 0.3,
  };
  if (text.includes('第一次')) score.CLASSIC += 0.8;
  if (text.includes('随便') || text.includes('轻松')) score.CITY_WALK += 0.8;
  if (text.includes('打卡') || text.includes('网红') || text.includes('热门')) score.HOT_SPOTS += 0.9;
  if (text.includes('平衡') || text.includes('都想要')) score.BALANCED += 0.7;

  let selected: FallbackStrategy = 'BALANCED';
  let best = -Infinity;
  (Object.keys(score) as FallbackStrategy[]).forEach((key) => {
    if (score[key] > best) {
      best = score[key];
      selected = key;
    }
  });
  return selected;
}

export function buildFallbackPlan(
  destination: string,
  strategy: FallbackPlan['strategy'] = 'CITY_WALK',
  options?: {
    researchPoiEvidence?: unknown;
    includeDebugScores?: boolean;
    includeCommuteMatrix?: boolean;
    tripPlanRequest?: TripPlanRequest;
  },
): FallbackPlan {
  const tpl = resolveTemplate(strategy, destination);
  const sourceData = resolveWorldPoisFromSources(destination, options?.researchPoiEvidence);
  const tripPlanRequest = options?.tripPlanRequest;
  const origin = tripPlanRequest?.origin;
  const startCoordinates =
    typeof origin === 'object' &&
    origin !== null &&
    Number.isFinite((origin as { lat?: number }).lat) &&
    Number.isFinite((origin as { lng?: number }).lng)
      ? { lat: Number((origin as { lat: number }).lat), lng: Number((origin as { lng: number }).lng) }
      : undefined;
  const scheduledTimeline = schedulePOI(
    strategy,
    destination,
    sourceData.pois,
    sourceData.confidence,
    {
      startCoordinates,
      travelMode: tripPlanRequest?.mode,
      dayWindow: tripPlanRequest?.constraints?.daily_time_window,
      pace:
        tripPlanRequest?.mode === 'walk'
          ? 'relaxed'
          : tripPlanRequest?.mode === 'drive'
            ? 'intense'
            : 'moderate',
    },
  );
  const planScore = computePlanScore(scheduledTimeline, sourceData.confidence);
  const selectedPois = scheduledTimeline
    .filter((x) => x.type === 'poi' || x.type === 'food' || x.type === 'end')
    .map((x) => x.action);
  const selectedWorldPois = selectedPois
    .map((name) => sourceData.pois.find((p) => p.name === name))
    .filter((p): p is WorldPoiRecord => !!p);
  const commuteMatrix = options?.includeCommuteMatrix
    ? buildCommuteMatrix(selectedWorldPois, tripPlanRequest?.mode, startCoordinates)
    : undefined;
  const pacingMode = resolvePacingMode(sourceData.confidence);
  return {
    type: 'fallback',
    strategy,
    name: tpl.name,
    timeline:
      scheduledTimeline.length > 0
        ? scheduledTimeline
        : [
            { time: '09:00', action: `到达${destination}市中心`, type: 'start' },
            { time: '10:00', action: tpl.exploreAction, type: 'explore' },
            { time: '12:00', action: '午餐（本地热门餐厅）', type: 'food' },
            { time: '14:00', action: tpl.poiAction, type: 'poi' },
            { time: '17:00', action: '咖啡/休息', type: 'rest' },
            { time: '19:00', action: tpl.nightAction, type: 'end' },
          ],
    confidence: 0.6,
    selected_pois: selectedPois,
    plan_score: planScore,
    explain: {
      summary: `系统选择 ${strategy} 策略，生成具象城市探索路线。`,
      reasoning: [
        `覆盖文化体验（${selectedPois[0] || '文化节点'}）`,
        `覆盖城市活力（${selectedPois[1] || '城市节点'}）`,
        `提供节奏恢复节点（${selectedPois[2] || '恢复节点'}）`,
        `夜间地标收尾（${selectedPois[selectedPois.length - 1] || '夜景节点'}）`,
        ...(pacingMode === 'conservative'
          ? ['数据置信度较低，已启用保守节奏以降低跨区跳点风险']
          : []),
      ],
      objective: '最大体验密度 + 节奏合理',
    },
    data_source: sourceData.source,
    source_confidence: sourceData.confidence,
    pacing_mode: pacingMode,
    buffer_minutes: pacingMode === 'conservative' ? getBufferMinutes() : undefined,
    commute_matrix: commuteMatrix,
  };
}

export function buildFallbackPlans(
  destination: string,
  options?: {
    researchPoiEvidence?: unknown;
    includeDebugScores?: boolean;
    includeCommuteMatrix?: boolean;
    tripPlanRequest?: TripPlanRequest;
  },
): FallbackPlan[] {
  const ordered: Array<FallbackPlan['strategy']> = ['CLASSIC', 'CITY_WALK', 'BALANCED'];
  return ordered.map((strategy, idx) => {
    const plan = buildFallbackPlan(destination, strategy, options);
    return { ...plan, confidence: Math.max(0.45, plan.confidence - idx * 0.05) };
  });
}

export function fallbackPlanToItinerary(
  requestId: string,
  tripPlanRequest: TripPlanRequest | undefined,
  fallbackPlan: FallbackPlan,
): Itinerary {
  const date = tripPlanRequest?.date_range?.start_date || tripPlanRequest?.start_date || new Date().toISOString().slice(0, 10);
  const items: ItineraryItem[] = fallbackPlan.timeline.map((item, index) => {
    const endByType: Record<FallbackTimelineItem['type'], string> = {
      start: '10:00',
      explore: '12:00',
      food: '13:30',
      poi: '16:30',
      rest: '18:00',
      end: '21:00',
    };
    return {
      id: `fallback-${index + 1}`,
      type: item.type === 'food' ? 'MEAL' : item.type === 'rest' ? 'REST' : 'POI',
      start_window: item.time,
      end_window: endByType[item.type],
      location_ref: {
        name: item.action,
      },
      notes: `Fallback/${fallbackPlan.strategy}`,
      evidence_refs: [],
      verified: false,
      verification_status: 'ASSUMPTION',
      metadata: {
        risk_level: 'LOW',
      },
    };
  });

  return {
    request_id: requestId,
    days: [{ date, items }],
    metadata: {
      total_days: 1,
      robustness_score: fallbackPlan.confidence,
    },
  };
}
