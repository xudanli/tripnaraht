// src/trips/decision/interfaces/ferry.interface.ts
/**
 * Ferry Interface
 * 
 * 渡轮数据接口
 */

export type FerryStatus = 'RUNNING' | 'CANCELLED' | 'SEASONAL';

export interface Ferry {
  id: string;
  status: FerryStatus;
  seasonOpenFrom?: number; // 1-12
  seasonOpenTo?: number; // 1-12
  lastStatusUpdate?: Date;
  metadata?: Record<string, any>;
}

