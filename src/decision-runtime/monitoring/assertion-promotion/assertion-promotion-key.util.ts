import type { AssertionPromotionSignal } from './assertion-promotion.config';

export function buildWeatherHazardPromotionKey(dayIndex: number): string {
  return `weather:hazard:day:${dayIndex}:WEATHER_ACTIVITY_PROHIBITED`;
}

export function buildWeatherRecoveryPromotionKey(dayIndex: number): string {
  return `weather:recovery:day:${dayIndex}:RECOVERY_OBSERVED`;
}

export function buildRoadHazardPromotionKey(roadId: string): string {
  return `road:hazard:${roadId.toUpperCase()}:ROAD_SEGMENT_UNAVAILABLE`;
}

export function buildRoadRecoveryPromotionKey(roadId: string): string {
  return `road:recovery:${roadId.toUpperCase()}:RECOVERY_OBSERVED`;
}

export function resolvePromotionKey(input: {
  signal: AssertionPromotionSignal;
  predicate: 'weather.hazard' | 'road.status';
  dayIndex?: number;
  roadId?: string;
}): string {
  if (input.predicate === 'weather.hazard') {
    const day = input.dayIndex ?? 0;
    return input.signal === 'RECOVERY_OBSERVED'
      ? buildWeatherRecoveryPromotionKey(day)
      : buildWeatherHazardPromotionKey(day);
  }
  const road = (input.roadId ?? 'unknown').toUpperCase();
  return input.signal === 'RECOVERY_OBSERVED'
    ? buildRoadRecoveryPromotionKey(road)
    : buildRoadHazardPromotionKey(road);
}
