import { Injectable } from '@nestjs/common';

@Injectable()
export class TravelTimeRouterService {
  /**
   * Internal travel time estimation (L2).
   * This is intentionally simple here; real implementation can call a router/time-matrix.
   */
  async estimateTravelMinutes(_params: {
    from: { lat: number; lng: number };
    to: { lat: number; lng: number };
    mode: 'DRIVE' | 'WALK' | 'TRANSIT' | string;
  }): Promise<number> {
    // Default: unknown → let callers fallback.
    return NaN;
  }
}

