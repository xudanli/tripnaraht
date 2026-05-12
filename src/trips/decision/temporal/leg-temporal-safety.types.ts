/**
 * 驾驶/转移段抵达时刻 vs 民用暮光 — Temporal Physics P0（safe arrival）。
 */

import type { ISODate, ISOTime } from '../world-model';

export type LegTemporalSeverity = 'SAFE' | 'MARGINAL' | 'UNSAFE';

export interface LegTemporalSafetyAssessment {
  /** 行程日历日（按日聚合 overnight pressure 用） */
  date: ISODate;
  /** 稳定键：如 `arrival:${slotId}` 或 `leg:${from}->${to}` */
  legId: string;
  /** 预计抵达目的地墙上时钟 */
  estimatedArrivalTime: ISOTime;
  civilDuskAtDestination?: ISOTime;
  safeArrival: boolean;
  /** 抵达相对民用暮光的余量（负表示已过暮光） */
  daylightMarginMinutes?: number;
  severity: LegTemporalSeverity;
  recommendedActions?: string[];
}
