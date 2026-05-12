/**
 * 走廊迁移后果模拟 — 「迁移后的世界」预测，不是 Repair 语义。
 */

import type { ISODate } from '../world-model';
import type { TemporalStressDelta } from './temporal-stress.types';

export interface CorridorBookingConflict {
  date: ISODate;
  severity: 'BLOCKING' | 'SOFT';
  reason: string;
  /** 可选：关联槽位 */
  slotId?: string;
}

export interface MigrationSimulationResult {
  /** 迁移引起的下游时间链总体平移估计（分钟） */
  downstreamShiftMinutes: number;
  bookingConflicts: CorridorBookingConflict[];
  /** 与经济学评估一致的期望机会增益（0–1） */
  estimatedOpportunityGain: number;
  temporalStressDelta: TemporalStressDelta;
}
