import { Injectable, Logger, Optional } from '@nestjs/common';
import { TransportRoutingService } from '../../../transport/transport-routing.service';
import { estimateDrivingLeg } from '../../attraction-explore/utils/attraction-explore-route-detour.util';
import { estimateArrivalTravelEta } from '../utils/same-day-travel-eta.util';
import type {
  GeoPointDto,
  SameDayTravelEta,
} from '../types/contextual-recommendations.types';

@Injectable()
export class SameDayTravelEtaService {
  private readonly logger = new Logger(SameDayTravelEtaService.name);

  constructor(
    @Optional() private readonly transportRouting?: TransportRoutingService,
  ) {}

  isLiveRoutesEnabled(): boolean {
    return (
      process.env.CONTEXTUAL_SAME_DAY_LIVE_ROUTES === '1' ||
      process.env.ATTRACTION_EXPLORE_LIVE_ROUTES === '1' ||
      process.env.ENABLE_GOOGLE_ROUTE_DETOUR === '1'
    );
  }

  async estimate(input: {
    currentLocation?: GeoPointDto | null;
    hotel?: { lat?: number | null; lng?: number | null; name?: string | null } | null;
    countryCode?: string;
    useLiveRoutes?: boolean;
  }): Promise<SameDayTravelEta> {
    const base = estimateArrivalTravelEta({
      currentLocation: input.currentLocation,
      hotel: input.hotel,
      countryCode: input.countryCode,
    });

    const useLive = input.useLiveRoutes ?? this.isLiveRoutesEnabled();
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

    if (!useLive || !this.transportRouting || !hasFrom || !hasHotel) {
      return base;
    }

    try {
      const route = await this.transportRouting.planPoiHopRoute(
        from!.lat,
        from!.lng,
        hotelLat!,
        hotelLng!,
        'drive',
      );
      const option = route.options[0];
      if (option?.durationMinutes != null) {
        const driveMinutes = Math.max(1, Math.round(option.durationMinutes));
        return {
          driveMinutes,
          pickupBufferMinutes: base.pickupBufferMinutes,
          totalMinutesUntilHotel: base.pickupBufferMinutes + driveMinutes,
          method: 'live_route_api',
          fromLabel: base.fromLabel,
        };
      }
    } catch (error) {
      this.logger.warn(
        `Live arrival ETA failed, heuristic kept: ${error instanceof Error ? error.message : error}`,
      );
    }

    // Keep heuristic; optionally refresh drive minutes via sync estimateDrivingLeg for consistency
    const sync = estimateDrivingLeg(
      { lat: from!.lat, lng: from!.lng },
      { lat: hotelLat!, lng: hotelLng! },
      { countryCode: input.countryCode },
    );
    return {
      driveMinutes: sync.durationMinutes,
      pickupBufferMinutes: base.pickupBufferMinutes,
      totalMinutesUntilHotel: base.pickupBufferMinutes + sync.durationMinutes,
      method: sync.method,
      fromLabel: base.fromLabel,
    };
  }
}
