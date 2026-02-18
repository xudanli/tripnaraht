/**
 * Outcome Capture 类型（Scheme D 第 3 层）
 *
 * 统一采集：satisfaction、fatigueLevel、actualCost、planAbandoned、daySkipped
 * 参考: docs/CHIEF_SCIENTIST_TECHNICAL_PROPOSAL.md, flywheel-types.ts
 */

/** 主观反馈 */
export interface OutcomeSubjectiveFeedback {
  /** 满意度 0-1 或 1-5 */
  satisfaction?: number;
  /** 疲劳程度 0-1 或 1-5 */
  fatigueLevel?: number;
  /** 节奏感受 */
  paceFeeling?: string;
  /** 预算感受 */
  budgetFeeling?: string;
}

/** 客观执行数据 */
export interface OutcomeObjectiveExecution {
  /** 实际花费 */
  actualCost?: number;
  /** 实际时长（天） */
  actualDuration?: number;
  /** 实际距离（km） */
  actualDistance?: number;
  /** 天气偏差描述 */
  weatherDeviation?: string;
  /** 延误事件 */
  delayEvents?: string[];
}

/** 失败/放弃信号 */
export interface OutcomeFailureSignals {
  /** 是否放弃整个行程 */
  planAbandoned?: boolean;
  /** 跳过的天数（如 ["2","3"]） */
  daySkipped?: string[];
  /** 是否提前返回 */
  earlyReturn?: boolean;
}

/** Outcome Capture 采集参数 */
export interface RecordOutcomeCaptureParams {
  tripRunId: string;
  userId: string;
  /** 主观反馈 */
  subjective?: OutcomeSubjectiveFeedback;
  /** 客观执行 */
  objective?: OutcomeObjectiveExecution;
  /** 失败信号 */
  failure?: OutcomeFailureSignals;
  /** Block 重要性学习：决策时使用的 Block keys（可选，有则供 Learning Layer 更新） */
  usedBlockKeys?: string[];
  /** 额外上下文 */
  context?: Record<string, unknown>;
}
