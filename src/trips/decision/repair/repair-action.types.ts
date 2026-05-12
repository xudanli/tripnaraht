/**
 * Progressive Micro-Repair — 动作语义（非全量重规划）
 *
 * 与 Neptune 走廊替换正交：此处仅「时间结构 / 可选性」局部修补候选。
 */

/** 可执行的修复动作类型（逐步接入 Booking / Fatigue / EV 时可扩展） */
export type RepairAction =
  | 'COMPRESS_STOP'
  | 'SHORTEN_ACTIVITY'
  | 'MOVE_SLOT_EARLIER'
  | 'MOVE_SLOT_LATER'
  | 'SWAP_POI'
  | 'SKIP_OPTIONAL_POI'
  | 'DELAY_CHECKIN'
  | 'EARLY_DEPARTURE'
  | 'SPLIT_DRIVE'
  | 'INSERT_REST';

export interface RepairInstruction {
  id: string;
  action: RepairAction;
  /** 受影响槽位（同一动作可涉及多个） */
  targetSlotIds: string[];
  /** ISO 日期（主要作用日） */
  date?: string;
  narrative: string;
  /** 建议调整的分钟数（压缩/平移/缩短） */
  suggestedDeltaMinutes?: number;
  /** 尝试顺序：数值越小越优先 */
  priority: number;
  /** 0–1 */
  confidence: number;
  /**
   * 机会迁移经济学摘要（仅当 repair 与 Opportunity Migration Evaluator 对齐时填充）。
   * Neptune 应在 tradeoff 批准后再执行走廊动作。
   */
  opportunityMigrationEvaluation?: {
    tradeoffScore: number;
    expectedGain: number;
    recommendation?: 'MIGRATE' | 'STAY';
    appliedThreshold?: number;
  };
  metadata?: Record<string, unknown>;
}

/** P8-2-B：DAG 边/结构级补丁提案 —— **禁止** 在 repair 层产出 IR 补丁。 */
export type ExecutionDAGPatch =
  import('../../execution-truth-dag/build-graph-patches').ExecutionGraphPatch;

export interface RepairEvaluationResult {
  /** 最小可行修复集合（有序建议；执行方可逐项采纳） */
  repairs: RepairInstruction[];
  /**
   * P8-2-B：对 ExecutionTruthDAG 的**结构补丁候选**（边级）；与 `executionTruthDAG` 对齐且 overlay 模式时填充。
   * IR 仅允许由 `compileDAGToIR` 在 DAG 重算后生成，repair 不注入 IR。
   */
  dagPatches?: ExecutionDAGPatch[];
  /**
   * Overnight 世界重构提案候选（Pressure→语义）；不自动应用。
   * Neptune 拓扑变更应消费「approved proposal」而非原始 pressure。
   */
  overnightRestructuringProposals?: import('../restructuring/overnight-restructuring-proposal.types').OvernightRestructuringProposal[];
  /** 采纳部分修复后是否应重算 execution quality / safeScore */
  suggestReevaluateExecutionQuality: boolean;
  notes?: string[];
}
