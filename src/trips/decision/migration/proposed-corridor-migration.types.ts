/**
 * Neptune Step 1：结构化迁移提案 — 不 commit、不直接 mutate TripPlan。
 */

import type { ISODate } from '../world-model';
import type { MigrationSimulationResult } from './migration-simulation.types';

export interface ProposedCorridorMigration {
  /** 稳定关联 simulate / 审批流 */
  proposalId: string;
  sourceRegion: string;
  targetRegion: string;
  affectedDates: ISODate[];
  rationale: string[];
  economicApproval: {
    /** 原始 tradeoff 分（排序用） */
    tradeoffScore: number;
    /** 归一化阈值（与 economics 层一致） */
    threshold: number;
  };
  /** 来自 OpportunityMigrationEvaluation.expectedOpportunityGain（模拟输出对齐） */
  expectedOpportunityGain?: number;
  /**
   * Step 2：模拟预览；未跑 simulate 时不填。
   * auto-apply 前必须存在且通过闸门。
   */
  simulationPreview?: MigrationSimulationResult;
}
