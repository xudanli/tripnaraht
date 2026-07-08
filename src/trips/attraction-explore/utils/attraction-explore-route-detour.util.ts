import { haversineDistanceKm } from '../../../transport/utils/geo-distance.util';
import { estimateIcelandCoordinateTravelTime } from '../../../transport/utils/iceland-coordinate-travel-time.util';

export interface RoutePoint {
  lat: number;
  lng: number;
}

export interface TravelLegEstimate {
  distanceKm: number;
  durationMinutes: number;
  method: 'iceland_heuristic' | 'generic_driving' | 'live_route_api';
}

export interface MarginalDetourEstimate {
  detourMinutes: number;
  extraDistanceKm: number;
  method: TravelLegEstimate['method'];
  viaSegmentIndex?: number;
}

export function estimateDrivingLeg(
  from: RoutePoint,
  to: RoutePoint,
  options?: { countryCode?: string; travelDate?: Date },
): TravelLegEstimate {
  const country = options?.countryCode?.toUpperCase() ?? 'IS';
  if (country === 'IS') {
    const iceland = estimateIcelandCoordinateTravelTime(from, to, {
      travelDate: options?.travelDate,
    });
    if (iceland.applies) {
      return {
        distanceKm: iceland.routeDistanceKm,
        durationMinutes: iceland.durationMinutes,
        method: 'iceland_heuristic',
      };
    }
  }

  const distanceKm = haversineDistanceKm(from, to);
  return {
    distanceKm: distanceKm * 1.25,
    durationMinutes: Math.round((distanceKm * 1.25 * 60) / 55),
    method: 'generic_driving',
  };
}

/** 边际绕行 = (A→X + X→B) - (A→B) */
export function estimateMarginalDetourMinutes(input: {
  from: RoutePoint;
  to: RoutePoint;
  via: RoutePoint;
  countryCode?: string;
  travelDate?: Date;
}): MarginalDetourEstimate {
  const direct = estimateDrivingLeg(input.from, input.to, {
    countryCode: input.countryCode,
    travelDate: input.travelDate,
  });
  const leg1 = estimateDrivingLeg(input.from, input.via, {
    countryCode: input.countryCode,
    travelDate: input.travelDate,
  });
  const leg2 = estimateDrivingLeg(input.via, input.to, {
    countryCode: input.countryCode,
    travelDate: input.travelDate,
  });

  const detourMinutes = Math.max(
    0,
    leg1.durationMinutes + leg2.durationMinutes - direct.durationMinutes,
  );

  return {
    detourMinutes,
    extraDistanceKm: Math.max(0, leg1.distanceKm + leg2.distanceKm - direct.distanceKm),
    method: leg1.method,
  };
}

export function findBestRouteInsertion(input: {
  routePoints: RoutePoint[];
  candidate: RoutePoint;
  countryCode?: string;
  travelDate?: Date;
}): MarginalDetourEstimate & { segmentIndex: number } | null {
  if (input.routePoints.length === 0) return null;

  if (input.routePoints.length === 1) {
    const leg = estimateDrivingLeg(input.routePoints[0]!, input.candidate, {
      countryCode: input.countryCode,
      travelDate: input.travelDate,
    });
    return {
      segmentIndex: 0,
      detourMinutes: leg.durationMinutes,
      extraDistanceKm: leg.distanceKm,
      method: leg.method,
      viaSegmentIndex: 0,
    };
  }

  let best: (MarginalDetourEstimate & { segmentIndex: number }) | null = null;

  for (let i = 0; i < input.routePoints.length - 1; i += 1) {
    const from = input.routePoints[i]!;
    const to = input.routePoints[i + 1]!;
    const estimate = estimateMarginalDetourMinutes({
      from,
      to,
      via: input.candidate,
      countryCode: input.countryCode,
      travelDate: input.travelDate,
    });
    const candidate = { ...estimate, segmentIndex: i };
    if (!best || candidate.detourMinutes < best.detourMinutes) {
      best = candidate;
    }
  }

  return best;
}

export function estimatePlaceDetourToRoute(input: {
  place: RoutePoint;
  routeAnchors: RoutePoint[];
  countryCode?: string;
  travelDate?: Date;
}): MarginalDetourEstimate | null {
  if (input.routeAnchors.length === 0) return null;
  if (input.routeAnchors.length === 1) {
    const leg = estimateDrivingLeg(input.routeAnchors[0]!, input.place, {
      countryCode: input.countryCode,
      travelDate: input.travelDate,
    });
    return {
      detourMinutes: leg.durationMinutes,
      extraDistanceKm: leg.distanceKm,
      method: leg.method,
    };
  }

  const best = findBestRouteInsertion({
    routePoints: input.routeAnchors,
    candidate: input.place,
    countryCode: input.countryCode,
    travelDate: input.travelDate,
  });
  return best;
}
