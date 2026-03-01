/**
 * UCB 访问追踪接口
 *
 * 专利 3.6.2 定理 5：Regret(T) = O(log T)
 * UCB 策略需追踪每动作被选次数 N_a 与总轮次 T
 *
 * 参考：docs/Decision_OS_技术交底书.md 3.6.2
 */

export interface IUCBVisitTrackerService {
  /** 记录动作 a 被选为推荐 */
  recordSelection(actionId: string): void;
  /** 获取动作 a 被选次数 N_a */
  getVisitCount(actionId: string): number;
  /** 获取总轮次 T */
  getTotalRounds(): number;
  /** UCB 探索项 c·√(ln(T+1)/(N_a+1)) */
  getUCBBonus(actionId: string, c?: number): number;
}
