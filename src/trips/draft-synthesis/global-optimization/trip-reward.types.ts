/**
 * 单次行程完成后的奖励信号，用于全局策略学习（非 POI 级奖励）。
 */
export interface TripReward {
  tripId: string;

  /** 0–1 用户最终满意度 */
  satisfactionScore: number;

  /** 0–1 修改次数 / 冲突 / 摩擦（高 = 差） */
  frictionScore: number;

  /** 0–1 仿真 vs 实际执行一致度 */
  executionStability: number;

  /** 0–1 输出与 Persona / 意图匹配度 */
  preferenceAlignment: number;

  /** 0–1 是否按规划走完全程等 */
  completionRate: number;

  /**
   * 可选：结合 Decision Trace 的主导引擎归因，用于更新全局 engineWeights。
   */
  dominantEngine?: 'LLM' | 'ALGO' | 'HYBRID' | 'SOLVER';
}
