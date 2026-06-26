import { Injectable, Optional } from '@nestjs/common';
import { SmartRoutesService } from '../../transport/services/smart-routes.service';
import { SelfHostedRoutingService } from '../../transport/services/self-hosted-routing.service';
import { estimateIcelandCoordinateTravelTime } from '../../transport/utils/iceland-coordinate-travel-time.util';

@Injectable()
export class TravelTimeRouterService {
  constructor(
    @Optional() private readonly smartRoutes?: SmartRoutesService,
    @Optional() private readonly selfHostedRouting?: SelfHostedRoutingService,
  ) {}

  /**
   * Internal travel time estimation (L2): self-hosted OSM graph first, commercial router second,
   * then Iceland-aware coordinate fallback.
   */
  async estimateTravelMinutes(params: {
    from: { lat: number; lng: number };
    to: { lat: number; lng: number };
    mode: 'DRIVE' | 'WALK' | 'TRANSIT' | string;
  }): Promise<number> {
    const mode = String(params.mode ?? 'DRIVE').toUpperCase();
    const googleMode = mode === 'WALK' ? 'WALKING' : mode === 'TRANSIT' ? 'TRANSIT' : 'DRIVING';

    const selfHosted = await this.selfHostedRouting?.estimateTravelMinutes(params);
    if (selfHosted && Number.isFinite(selfHosted.durationMinutes) && selfHosted.durationMinutes > 0) {
      return selfHosted.durationMinutes;
    }

    if (this.smartRoutes) {
      const routes = await this.smartRoutes.getRoutes(
        params.from.lat,
        params.from.lng,
        params.to.lat,
        params.to.lng,
        googleMode,
      );
      const best = routes
        .map((route) => Number(route.durationMinutes))
        .filter((minutes) => Number.isFinite(minutes) && minutes > 0)
        .sort((a, b) => a - b)[0];
      if (Number.isFinite(best)) return best;
    }

    if (googleMode === 'DRIVING') {
      const icelandEstimate = estimateIcelandCoordinateTravelTime(params.from, params.to);
      if (icelandEstimate.applies) {
        return icelandEstimate.durationMinutes;
      }
    }

    return NaN;
  }
}
