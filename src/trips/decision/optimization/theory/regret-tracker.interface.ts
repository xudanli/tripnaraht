/**
 * Regret 追踪接口
 *
 * 专利 4.14.4：Regret(T) → 0，E[U(π*) − U(π_t)] ≤ O(1/√T)
 *
 * 参考：docs/Decision_OS_技术交底书.md 4.14.4
 * 实现方案：docs/DECISION_OS_ULTIMATE_THEORY_IMPLEMENTATION_PLAN.md
 */

export interface IRegretTrackerService {
  /** 记录第 round 轮的效用 U(π_t) */
  recordUtility(round: number, utility: number): void;
  /** 累计 Regret(T) = Σ_t (U* - U(π_t)) */
  getCumulativeRegret(T: number): number;
  /** 理论界 O(1/√T) 系数 */
  getTheoreticalBound(T: number): number;
}
