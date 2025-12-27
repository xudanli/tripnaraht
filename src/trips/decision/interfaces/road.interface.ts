// src/trips/decision/interfaces/road.interface.ts
/**
 * Road Interface
 * 
 * 道路数据接口
 */

export type RoadStatus = 'OPEN' | 'CLOSED' | 'SEASONAL' | 'RESTRICTED';

export type HazardTag = 'AVALANCHE' | 'FLOOD' | 'MUDSLIDE' | 'NONE';

export interface Road {
  id: string;
  segmentId?: string;
  status: RoadStatus;
  seasonOpenFrom?: number; // 1-12
  seasonOpenTo?: number; // 1-12
  hazardTag: HazardTag;
  ferryRouteId?: string;
  metadata?: Record<string, any>;
}

