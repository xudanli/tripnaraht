/**
 * Task Closure 最小骨架（booking 锚点）：Completion / State / Policy / Proposal 的类型契约。
 * 不与 MCP 或 LLM 强耦合；Executor 接入时再映射真实 tool 名。
 */

/** 硬编码三阶段路径（第一版禁止泛化成通用 DAG）。 */
export type BookingStage = 'search' | 'validate' | 'book';

/** P2：Completion Contract — 定义「什么叫做完」。 */
export interface BookingCompletionContract {
  has_route: boolean;
  time_feasible: boolean;
  inventory_checked: boolean;
}

/** P2.5 Progress Attribution：无 completion 前进时的粗粒度原因（可聚合优化 Policy/schema/retry）。 */
export type BookingNoProgressReason = 'no_effect' | 'invalid_stage' | 'bad_params' | 'external_block';

/** 近期 no_progress 序列上的粗模式（策略层 / 面板用，不等同于单步归因）。 */
export type BookingFailurePattern =
  | 'none'
  | 'ineffective_loop'
  | 'external_blocked'
  | 'stage_misaligned';

/**
 * P1：最小 Execution Context — 单一事实源雏形（仅三字段）。
 * 后续 tool effects 只允许通过规范化 reducer 更新此对象。
 */
export interface BookingExecutionContext {
  route: unknown[];
  inventory_checked: boolean;
  failures: Array<{ at: string; detail: string }>;
}

/** 唯一主任务锚（Step 1）。 */
export interface BookingTaskGoal {
  task: 'booking';
  goal: string;
}

/**
 * 「半 DSL」— LLM 输出提案而非直接扣扳机；执行前经 Policy + State。
 */
export interface BookingProposedAction {
  type: 'PROPOSED_ACTION';
  name: string;
  intent: 'booking';
  args?: Record<string, unknown>;
}

export interface BookingPolicyDecision {
  allowed: BookingProposedAction[];
  /** 仍执行 MCP，但打 discouraged 标签（收紧策略的软层） */
  discouraged: BookingProposedAction[];
  blocked: Array<{ action: BookingProposedAction; reason: string }>;
  /** 正反馈：Policy 推断的更可能有效的语义方向（非强制，供 LLM / 观测） */
  suggested: BookingProposedAction[];
  /** 预埋：软权重，待 ranking/RL 消费；当前可不填 */
  discouraged_meta?: Record<string, { weight?: number }>;
}

/** HTTP trace 顶层聚合：不必回放逐步明细即可看浪费分布 */
export interface BookingToolLoopSummary {
  steps: number;
  progress_steps: number;
  no_progress_steps: number;
  no_progress_by_reason: Record<BookingNoProgressReason, number>;
  /** 真实 MCP 调用次数（不含 POLICY_BLOCKED 假信封） */
  total_executed_steps: number;
  /** progress_steps / total_executed_steps（按 MCP 次数字典意） */
  loop_efficiency: number;
  /** progress_steps / steps（LLM 轮次上的决策效率） */
  step_efficiency: number;
  /** trace 中最后一轮非 none 的 pattern（便于回归 / 实验对照） */
  failure_pattern_last: BookingFailurePattern;
  /** 最后一轮记录的连续相同 pattern 长度（0 = 无或未触发） */
  pattern_stability_last: number;
  /** 全 trace 中出现最多的非 none pattern（短期震荡 vs 长期主导） */
  dominant_pattern: BookingFailurePattern;
  /** 存在 suggested 的轮次中，LLM 采纳或 override 生效的比例 */
  suggested_usage_rate: number;
  /** suggested 强制纠偏触发次数 */
  suggested_override_count: number;
  /** 各 reason 在 no_progress 轮中的占比（0–1） */
  efficiency_by_reason: Record<BookingNoProgressReason, number>;
}

/** Agentic executor 接线：单一 Task Closure 入口（booking）。 */
export interface BookingTaskClosureRunOptions {
  mode: 'booking';
  /** 合并进默认 ctx：route / inventory_checked / failures */
  initialContext?: Partial<BookingExecutionContext>;
  /**
   * 首个 policy stage；weather-only 快路径建议 `validate`，以便 LLM→check_weather 映射命中 allowlist。
   * 缺省由 {@link suggestBookingStage} 根据 initialContext 推导。
   */
  initialStage?: BookingStage;
}
