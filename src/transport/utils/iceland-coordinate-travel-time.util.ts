import { haversineDistanceKm } from './geo-distance.util';

export type IcelandRoadHeuristicClass =
  | 'non_iceland'
  | 'urban_or_short'
  | 'ring_road_corridor'
  | 'remote_coastal'
  | 'westfjords'
  | 'highlands_or_f_road_candidate';

export interface IcelandCoordinateTravelTimeEstimate {
  applies: boolean;
  distanceKm: number;
  routeDistanceKm: number;
  durationMinutes: number;
  roadClass: IcelandRoadHeuristicClass;
  confidence: 'LOW' | 'MEDIUM' | 'HIGH';
  reasons: string[];
}

export interface IcelandCoordinateTravelTimeOptions {
  travelDate?: Date;
}

export function isLikelyIcelandCoordinate(point: { lat: number; lng: number }): boolean {
  return point.lat >= 62.8 && point.lat <= 67.5 && point.lng >= -25.5 && point.lng <= -12.0;
}

function midpoint(a: { lat: number; lng: number }, b: { lat: number; lng: number }): { lat: number; lng: number } {
  return { lat: (a.lat + b.lat) / 2, lng: (a.lng + b.lng) / 2 };
}

function isHighlandsCandidate(point: { lat: number; lng: number }): boolean {
  return point.lat >= 64.05 && point.lat <= 65.45 && point.lng >= -20.8 && point.lng <= -16.0;
}

function isWestfjordsCandidate(point: { lat: number; lng: number }): boolean {
  return point.lat >= 65.2 && point.lng <= -21.0;
}

function isRingRoadCorridorCandidate(point: { lat: number; lng: number }): boolean {
  if (isHighlandsCandidate(point) || isWestfjordsCandidate(point)) return false;
  return point.lat < 64.35 || point.lat > 65.2 || point.lng > -17.0;
}

function classifyIcelandRoute(
  from: { lat: number; lng: number },
  to: { lat: number; lng: number },
  distanceKm: number,
): IcelandRoadHeuristicClass {
  if (!isLikelyIcelandCoordinate(from) || !isLikelyIcelandCoordinate(to)) return 'non_iceland';
  if (distanceKm < 8) return 'urban_or_short';

  const mid = midpoint(from, to);
  if (isHighlandsCandidate(mid) || isHighlandsCandidate(from) || isHighlandsCandidate(to)) {
    return 'highlands_or_f_road_candidate';
  }
  if (isWestfjordsCandidate(mid) || isWestfjordsCandidate(from) || isWestfjordsCandidate(to)) {
    return 'westfjords';
  }
  if (isRingRoadCorridorCandidate(mid)) {
    return 'ring_road_corridor';
  }
  return 'remote_coastal';
}

function seasonalMultiplier(roadClass: IcelandRoadHeuristicClass, travelDate?: Date): { multiplier: number; reason?: string } {
  const month = (travelDate ?? new Date()).getUTCMonth() + 1;
  const isWinter = month <= 3 || month >= 11;
  const isShoulder = month === 4 || month === 5 || month === 10;

  if (roadClass === 'highlands_or_f_road_candidate') {
    if (isWinter) return { multiplier: 1.9, reason: 'winter_highlands_penalty' };
    if (isShoulder) return { multiplier: 1.45, reason: 'shoulder_season_highlands_penalty' };
  }

  if (roadClass === 'westfjords' || roadClass === 'remote_coastal') {
    if (isWinter) return { multiplier: 1.35, reason: 'winter_remote_road_penalty' };
    if (isShoulder) return { multiplier: 1.15, reason: 'shoulder_season_remote_road_penalty' };
  }

  if (isWinter && roadClass === 'ring_road_corridor') {
    return { multiplier: 1.18, reason: 'winter_ring_road_penalty' };
  }

  return { multiplier: 1 };
}

export function estimateIcelandCoordinateTravelTime(
  from: { lat: number; lng: number },
  to: { lat: number; lng: number },
  options?: IcelandCoordinateTravelTimeOptions,
): IcelandCoordinateTravelTimeEstimate {
  const distanceKm = haversineDistanceKm(from, to);
  const roadClass = classifyIcelandRoute(from, to, distanceKm);
  if (roadClass === 'non_iceland') {
    return {
      applies: false,
      distanceKm,
      routeDistanceKm: distanceKm,
      durationMinutes: 0,
      roadClass,
      confidence: 'LOW',
      reasons: ['outside_iceland_bbox'],
    };
  }

  const byClass: Record<Exclude<IcelandRoadHeuristicClass, 'non_iceland'>, { speedKmh: number; detour: number; confidence: 'LOW' | 'MEDIUM' | 'HIGH' }> = {
    urban_or_short: { speedKmh: 35, detour: 1.25, confidence: 'MEDIUM' },
    ring_road_corridor: { speedKmh: 78, detour: 1.35, confidence: 'MEDIUM' },
    remote_coastal: { speedKmh: 52, detour: 1.55, confidence: 'LOW' },
    westfjords: { speedKmh: 48, detour: 1.75, confidence: 'LOW' },
    highlands_or_f_road_candidate: { speedKmh: 24, detour: 1.9, confidence: 'LOW' },
  };

  const cfg = byClass[roadClass];
  const seasonal = seasonalMultiplier(roadClass, options?.travelDate);
  const routeDistanceKm = distanceKm * cfg.detour;
  let durationMinutes = (routeDistanceKm / cfg.speedKmh) * 60 * seasonal.multiplier;
  const reasons = [`iceland_${roadClass}`, `speed_${cfg.speedKmh}_kmh`, `detour_${cfg.detour}`];

  if (seasonal.reason) reasons.push(seasonal.reason);

  if (roadClass === 'highlands_or_f_road_candidate') {
    const riverFordPenalty = distanceKm >= 35 ? 12 : 6;
    durationMinutes += riverFordPenalty;
    reasons.push(`f_road_or_ford_penalty_${riverFordPenalty}_min`);
  }

  return {
    applies: true,
    distanceKm,
    routeDistanceKm,
    durationMinutes: Math.max(1, Math.round(durationMinutes)),
    roadClass,
    confidence: cfg.confidence,
    reasons,
  };
}
