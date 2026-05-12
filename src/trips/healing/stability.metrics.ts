/**
 * 稳定性度量输入 — 由 ExecutionSemanticView / ConstraintDiff / 控制器汇总
 */

export interface StabilityMetricsInput {
  /** 观测窗口内语义增量次数（或约束 diff 次数） */
  readonly deltaCount: number;
  readonly highSeverityIssues: number;
  readonly mediumIssues: number;
  /** 单位时间内的约束变更速率（如每分钟 meaningful diff 次数） */
  readonly deltaVelocity: number;
  /** 尚未落地的重规划请求计数 */
  readonly pendingReplans: number;
}
