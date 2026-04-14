import type { FallbackStrategy } from './fallback-templates.config';
import type { WorldPoiRecord, PoiType } from './poi-world-model.mock';

export interface ScheduledPoiItem {
  time: string;
  poi: WorldPoiRecord;
}

interface ScheduleOptions {
  sourceConfidence?: number;
  conservativeThreshold?: number;
  includeDebug?: boolean;
  startCoordinates?: { lat: number; lng: number };
  travelMode?: 'walk' | 'drive' | 'transit' | 'mixed';
  dayWindow?: { start: string; end: string };
  pace?: 'relaxed' | 'moderate' | 'intense';
}

export interface PoiScoreDebugItem {
  slot: string;
  desiredType: PoiType;
  poiName: string;
  typeScore: number;
  timeScore: number;
  ratingScore: number;
  affordabilityScore: number;
  nameHintScore: number;
  commuteDistanceKm: number;
  commuteMinutes: number;
  commutePenalty: number;
  timeWindowPenalty: number;
  totalScore: number;
}

const STRATEGY_TYPE_SEQUENCE: Record<FallbackStrategy, PoiType[]> = {
  CLASSIC: ['culture', 'food', 'culture', 'landmark'],
  CITY_WALK: ['city', 'food', 'city', 'landmark'],
  BALANCED: ['culture', 'food', 'relax', 'landmark'],
  HOT_SPOTS: ['city', 'food', 'relax', 'landmark'],
  ROAD_TRIP: ['landmark', 'food', 'landmark', 'landmark'],
};

const STRATEGY_NAME_HINTS: Partial<Record<FallbackStrategy, string[]>> = {
  BALANCED: ['浅草寺', '银座', '明治神宫', '东京塔'],
  CLASSIC: ['浅草寺', '皇居', '银座', '东京塔'],
  CITY_WALK: ['涩谷', '原宿', '表参道', '咖啡'],
  /** 自然线不绑定具体城市名词，避免错误地名 boost */
  ROAD_TRIP: [],
};

const TIME_SLOTS = ['09:00', '11:30', '14:00', '19:00'];

function slotOfTime(t: string): 'morning' | 'afternoon' | 'night' {
  if (t < '12:00') return 'morning';
  if (t < '18:00') return 'afternoon';
  return 'night';
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

function hhmmToMinutes(t: string): number {
  const [h, m] = t.split(':').map((x) => Number(x));
  if (!Number.isFinite(h) || !Number.isFinite(m)) return 0;
  return h * 60 + m;
}

function modeSpeedKmh(mode?: ScheduleOptions['travelMode']): number {
  if (mode === 'walk') return 4.5;
  if (mode === 'drive') return 24;
  if (mode === 'transit') return 16;
  return 10;
}

function estimateCommuteMinutes(
  from: { lat: number; lng: number },
  to: { lat: number; lng: number },
  mode?: ScheduleOptions['travelMode'],
): number {
  const km = haversineKm(from, to);
  const kmh = modeSpeedKmh(mode);
  const minutes = (km / Math.max(1, kmh)) * 60;
  return Math.max(5, Math.round(minutes));
}

function paceCommutePenaltyFactor(pace?: ScheduleOptions['pace']): number {
  if (pace === 'relaxed') return 0.06;
  if (pace === 'intense') return 0.02;
  return 0.04;
}

function scorePoiForSlot(
  poi: WorldPoiRecord,
  desiredType: PoiType,
  slot: string,
): {
  baseScore: number;
  typeScore: number;
  timeScore: number;
  ratingScore: number;
  affordabilityScore: number;
} {
  const slotType = slotOfTime(slot);
  const typeScore = poi.type === desiredType ? 4 : 0;
  const timeScore = poi.best_time === slotType ? 2 : 0;
  const ratingScore = poi.rating / 2;
  const affordabilityScore = 1.2 - poi.price_level * 0.2;
  return {
    baseScore: typeScore + timeScore + ratingScore + affordabilityScore,
    typeScore,
    timeScore,
    ratingScore,
    affordabilityScore,
  };
}

function scoreWithStrategyHint(
  poi: WorldPoiRecord,
  baseScore: number,
  strategy: FallbackStrategy,
  slotIndex: number,
): { totalScore: number; nameHintScore: number } {
  const hints = STRATEGY_NAME_HINTS[strategy];
  if (!hints || !hints[slotIndex]) return { totalScore: baseScore, nameHintScore: 0 };
  const hint = hints[slotIndex];
  const nameBoost = poi.name.includes(hint) ? 2.5 : 0;
  return { totalScore: baseScore + nameBoost, nameHintScore: nameBoost };
}

function schedulePoiInternal(
  strategy: FallbackStrategy,
  pois: WorldPoiRecord[],
  options?: ScheduleOptions,
): { items: ScheduledPoiItem[]; debug: PoiScoreDebugItem[] } {
  const debug: PoiScoreDebugItem[] = [];
  const sourceConfidence = options?.sourceConfidence ?? 1;
  const threshold = options?.conservativeThreshold ?? 0.7;
  const conservativeMode = sourceConfidence < threshold;
  const desiredTypes = STRATEGY_TYPE_SEQUENCE[strategy];
  const selected: WorldPoiRecord[] = [];
  const pace = options?.pace ?? (conservativeMode ? 'relaxed' : 'moderate');
  const startAnchor =
    options?.startCoordinates ??
    (pois[0]?.coordinates ? { lat: pois[0].coordinates.lat, lng: pois[0].coordinates.lng } : undefined);
  let currentAnchor = startAnchor;
  let currentTimeMinutes = hhmmToMinutes(options?.dayWindow?.start || TIME_SLOTS[0]);
  const windowEndMinutes = hhmmToMinutes(options?.dayWindow?.end || '21:00');

  desiredTypes.forEach((desiredType, idx) => {
    const slot = TIME_SLOTS[idx];
    const scored = pois
      .filter((p) => !selected.some((s) => s.id === p.id))
      .map((p) => {
        const breakdown = scorePoiForSlot(p, desiredType, slot);
        const hinted = scoreWithStrategyHint(p, breakdown.baseScore, strategy, idx);
        const commuteMinutes = currentAnchor
          ? estimateCommuteMinutes(currentAnchor, p.coordinates, options?.travelMode)
          : 0;
        const commuteDistanceKm = currentAnchor
          ? haversineKm(currentAnchor, p.coordinates)
          : 0;
        const commutePenalty = Number(
          (commuteMinutes * paceCommutePenaltyFactor(pace)).toFixed(2),
        );
        const startAt = Math.max(currentTimeMinutes + commuteMinutes, hhmmToMinutes(slot));
        const endAt = startAt + (p.duration || 90);
        const overtimeMinutes = Math.max(0, endAt - windowEndMinutes);
        const timeWindowPenalty = Number((overtimeMinutes * 0.03).toFixed(2));
        const totalScore = hinted.totalScore - commutePenalty - timeWindowPenalty;
        const row: PoiScoreDebugItem = {
          slot,
          desiredType,
          poiName: p.name,
          typeScore: breakdown.typeScore,
          timeScore: breakdown.timeScore,
          ratingScore: Number(breakdown.ratingScore.toFixed(2)),
          affordabilityScore: Number(breakdown.affordabilityScore.toFixed(2)),
          nameHintScore: hinted.nameHintScore,
          commuteDistanceKm: Number(commuteDistanceKm.toFixed(2)),
          commuteMinutes,
          commutePenalty,
          timeWindowPenalty,
          totalScore: Number(totalScore.toFixed(2)),
        };
        if (options?.includeDebug) {
          debug.push(row);
        }
        return { poi: p, score: totalScore, travelMinutes: commuteMinutes };
      })
      .sort((a, b) => b.score - a.score);
    if (scored[0]?.poi) {
      selected.push(scored[0].poi);
      currentAnchor = {
        lat: scored[0].poi.coordinates.lat,
        lng: scored[0].poi.coordinates.lng,
      };
      currentTimeMinutes = Math.max(
        currentTimeMinutes + (scored[0].travelMinutes || 0) + (scored[0].poi.duration || 90),
        hhmmToMinutes(slot) + (scored[0].poi.duration || 90),
      );
    }
  });

  if (selected.length === 0) return { items: [], debug };
  const slots = conservativeMode ? ['09:00', '12:00', '15:30'] : TIME_SLOTS;
  return {
    items: selected.slice(0, slots.length).map((poi, i) => ({
      time: slots[i],
      poi,
    })),
    debug,
  };
}

export function schedulePoiByStrategy(
  strategy: FallbackStrategy,
  pois: WorldPoiRecord[],
  options?: ScheduleOptions,
): ScheduledPoiItem[] {
  return schedulePoiInternal(strategy, pois, options).items;
}

export function schedulePoiByStrategyWithDebug(
  strategy: FallbackStrategy,
  pois: WorldPoiRecord[],
  options?: ScheduleOptions,
): { items: ScheduledPoiItem[]; debug: PoiScoreDebugItem[] } {
  return schedulePoiInternal(strategy, pois, { ...options, includeDebug: true });
}

export function computeScheduleScore(items: ScheduledPoiItem[], sourceConfidence = 1): number {
  if (items.length === 0) return 0;
  const text = items.map((x) => x.poi.type).join('|');
  const coverage = /culture|landmark/.test(text) ? 3.2 : 2.4;
  const diversity = new Set(items.map((x) => x.poi.type)).size >= 3 ? 3.0 : 2.2;
  const pacing = items.length >= 4 ? 2.6 : 2.0;
  const duplicatePenalty =
    items.length - new Set(items.map((x) => x.poi.type)).size > 1 ? 0.8 : 0;
  const confidenceWeight = Math.max(0.6, Math.min(1, sourceConfidence));
  return Number(((coverage + diversity + pacing - duplicatePenalty) * confidenceWeight).toFixed(1));
}
