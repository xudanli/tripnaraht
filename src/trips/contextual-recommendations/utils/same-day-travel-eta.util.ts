import { estimateDrivingLeg } from '../../attraction-explore/utils/attraction-explore-route-detour.util';
import type {
  GeoPointDto,
  SameDayTravelEta,
} from '../types/contextual-recommendations.types';

const KEF = { lat: 63.985, lng: -22.605 };

function isNearKef(loc?: GeoPointDto | null): boolean {
  if (!loc) return false;
  if (/keflavik|凯夫拉维克|\bkef\b/i.test(loc.label ?? '')) return true;
  if (!Number.isFinite(loc.lat) || !Number.isFinite(loc.lng)) return false;
  if (loc.lat === 0 && loc.lng === 0) return false;
  const dLat = loc.lat - KEF.lat;
  const dLng = loc.lng - KEF.lng;
  return dLat * dLat + dLng * dLng < 0.15 * 0.15;
}

/**
 * Estimate minutes from current location to hotel (drive + pickup/buffer).
 * Uses Iceland road heuristic when countryCode=IS.
 */
export function estimateArrivalTravelEta(input: {
  currentLocation?: GeoPointDto | null;
  hotel?: { lat?: number | null; lng?: number | null; name?: string | null } | null;
  countryCode?: string;
}): SameDayTravelEta {
  const atKef = isNearKef(input.currentLocation);
  const pickupBufferMinutes = atKef ? 50 : 15;

  const from = input.currentLocation;
  const hotelLat = input.hotel?.lat;
  const hotelLng = input.hotel?.lng;
  const hasFrom =
    from &&
    Number.isFinite(from.lat) &&
    Number.isFinite(from.lng) &&
    !(from.lat === 0 && from.lng === 0);
  const hasHotel =
    hotelLat != null &&
    hotelLng != null &&
    Number.isFinite(hotelLat) &&
    Number.isFinite(hotelLng);

  if (hasFrom && hasHotel) {
    const leg = estimateDrivingLeg(
      { lat: from!.lat, lng: from!.lng },
      { lat: hotelLat!, lng: hotelLng! },
      { countryCode: input.countryCode },
    );
    return {
      driveMinutes: leg.durationMinutes,
      pickupBufferMinutes,
      totalMinutesUntilHotel: pickupBufferMinutes + leg.durationMinutes,
      method: leg.method,
      fromLabel: from!.label ?? null,
    };
  }

  // Fallback constants when coords incomplete
  if (atKef) {
    return {
      driveMinutes: 50,
      pickupBufferMinutes,
      totalMinutesUntilHotel: pickupBufferMinutes + 50,
      method: 'fallback_kef_rek',
      fromLabel: from?.label ?? 'Keflavik',
    };
  }

  return {
    driveMinutes: 20,
    pickupBufferMinutes,
    totalMinutesUntilHotel: pickupBufferMinutes + 20,
    method: 'fallback_local',
    fromLabel: from?.label ?? null,
  };
}
