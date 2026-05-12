import type { CityDigitalTwin } from './city-digital-twin.types';

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

/**
 * 城市级轻量仿真占位：拥堵传导、POI 队列平滑、需求扩散（可换 ABM）。
 */
export function forecastCongestionDelta(
  twin: CityDigitalTwin,
  edgeKey: string,
  deltaDemand: number,
): number {
  const cur = twin.mobilityLayer.congestion[edgeKey] ?? 0.3;
  return clamp01(cur + deltaDemand * 0.08);
}

export function estimatePoiQueueAfterVisit(
  twin: CityDigitalTwin,
  placeId: number,
  visitIntensity: number,
): number {
  const cur = twin.poiLayer.liveQueue[placeId] ?? 0.35;
  return clamp01(cur + visitIntensity * 0.05);
}

export function diffuseTripDensity(
  twin: CityDigitalTwin,
  regionKey: string,
  increment: number,
): Record<string, number> {
  const next = { ...twin.demandLayer.tripDensity };
  next[regionKey] = (next[regionKey] ?? 0) + increment;
  return next;
}
