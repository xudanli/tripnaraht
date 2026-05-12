/**
 * 各约束域 → 融合层的统一输出协议（多域同一语言）
 */

export type ConstraintDomainId = 'ROAD' | 'WEATHER' | 'BOOKING' | 'FATIGUE';

export interface ConstraintDomainOutput {
  readonly domain: ConstraintDomainId;
  readonly severity: 'LOW' | 'MEDIUM' | 'HIGH';
  /** 行程槽位 id（PlanSlot.id） */
  readonly affectedSlots: readonly string[];
  readonly affectedPOIs: readonly string[];
  /** 是否阻断该槽位可执行性 */
  readonly blocking: boolean;
  readonly reasonCode: string;
  /** 0–1，数据源置信度 */
  readonly confidence: number;
}
