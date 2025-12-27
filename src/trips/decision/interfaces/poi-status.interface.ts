// src/trips/decision/interfaces/poi-status.interface.ts
/**
 * POI Status Interface
 * 
 * POI 状态数据接口
 */

export type PoiStatus = 'OPEN' | 'CLOSED' | 'UNKNOWN';

export interface PoiStatusData {
  id: string;
  status: PoiStatus;
  closingReason?: string;
  validFrom?: Date;
  validTo?: Date;
  lastCheckedAt?: Date;
  metadata?: Record<string, any>;
}

