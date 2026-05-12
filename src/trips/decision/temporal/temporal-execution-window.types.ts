/**
 * Leg/slot 级可执行时间窗 — 细粒度约束传播（非 day-level 摘要）。
 */

import type { ISOTime } from '../world-model';

export type TemporalWindowDerivation =
  | 'DAYLIGHT'
  | 'WEATHER'
  | 'ROAD'
  | 'BOOKING';

export interface TemporalExecutionWindow {
  slotId: string;
  startFeasibleAt?: ISOTime;
  endFeasibleAt?: ISOTime;
  /** true：硬截止（如法定暮光后禁入某走廊） */
  hardBoundary?: boolean;
  reasonCodes: string[];
  derivedFrom: TemporalWindowDerivation[];
}
