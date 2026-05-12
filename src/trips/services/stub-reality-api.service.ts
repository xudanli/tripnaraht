import { Injectable } from '@nestjs/common';
import type {
  BookResourceRequest,
  PoiAvailabilityQuery,
  RealityApi,
} from '../draft-synthesis/digital-twin/reality-api.interface';

/**
 * Reality API 占位实现：联调前返回确定性 Mock。
 */
@Injectable()
export class StubRealityApiService implements RealityApi {
  async queryPOIAvailability(q: PoiAvailabilityQuery): Promise<{ available: boolean; detail?: string }> {
    return { available: true, detail: `stub placeId=${q.placeId}` };
  }

  async bookResource(req: BookResourceRequest): Promise<{ bookingId: string; status: 'CONFIRMED' | 'PENDING' }> {
    return {
      bookingId: `stub-${req.resourceKey}-${req.idempotencyKey ?? Date.now()}`,
      status: 'CONFIRMED',
    };
  }

  async cancelResource(_bookingId: string): Promise<{ ok: boolean }> {
    return { ok: true };
  }

  async getTrafficState(regionKey: string): Promise<{ congestion01: number; detail?: string }> {
    return { congestion01: 0.35, detail: `stub region=${regionKey}` };
  }

  async getEventUpdates(cityKey: string): Promise<{ events: unknown[] }> {
    return { events: [{ stub: true, cityKey }] };
  }
}
