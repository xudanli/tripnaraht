/**
 * 现实基础设施统一适配面（OTA / 预订 / 地图 / 票务 / 交通）。
 * 具体 Provider 实现依赖密钥与合规，此处仅契约。
 */
export interface TimeWindow {
  startIso: string;
  endIso: string;
}

export interface PoiAvailabilityQuery {
  placeId: number;
  window: TimeWindow;
  partySize?: number;
}

export interface BookResourceRequest {
  resourceKey: string;
  placeId?: number;
  window?: TimeWindow;
  /** 幂等键 */
  idempotencyKey?: string;
}

export interface RealityApi {
  queryPOIAvailability(q: PoiAvailabilityQuery): Promise<{ available: boolean; detail?: string }>;
  bookResource(req: BookResourceRequest): Promise<{ bookingId: string; status: 'CONFIRMED' | 'PENDING' }>;
  cancelResource(bookingId: string): Promise<{ ok: boolean }>;
  getTrafficState(regionKey: string): Promise<{ congestion01: number; detail?: string }>;
  getEventUpdates(cityKey: string): Promise<{ events: unknown[] }>;
}
