/**
 * P2-A：迁移评估结果 — Neptune 之前闸门；Utility vs Disruption（静态经济学）。
 */

import type { ISODate } from '../signals/aurora-night-signals.types';

export interface OpportunityMigrationEvaluation {
  /** 评估作用日 */
  date: ISODate;
  /** 语义区域 id（如 capital_corridor、south_coast） */
  sourceRegion: string;
  targetRegion: string;
  /** 相对迁移后期望的机会效用增量，0–1 */
  expectedOpportunityGain: number;
  travelCostMinutes: number;
  /** 住宿/锚点扰动成本，0–1 */
  lodgingDisruptionCost: number;
  /** 对后续日程的挤压程度，0–1 */
  downstreamPlanImpactScore: number;
  recommendation: 'MIGRATE' | 'STAY';
  confidence: number;
  /** 加权净得分（与 `migrationTradeoffThreshold(stance)` 比较） */
  tradeoffScore: number;
  /** 本次比较所用的阈值（intent / stance） */
  appliedThreshold: number;
  /** 审计与 UI 短叙述 */
  rationale: string[];
}
