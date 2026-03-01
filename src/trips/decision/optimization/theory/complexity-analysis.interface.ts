/**
 * 决策复杂度分析接口
 *
 * 专利 4.14.2 定理 6：Time Complexity = O(N·ρ·H)
 *
 * 参考：docs/Decision_OS_技术交底书.md 4.14.2
 */

export interface ComplexityReport {
  /** 候选动作数 N */
  nCandidates: number;
  /** 可行候选数 |A_f| */
  nFeasible: number;
  /** 可行域比例 ρ = |A_f|/|A| */
  rho: number;
  /** 规划视野 H */
  horizon: number;
  /** 估计操作数 O(N·ρ·H) */
  estimatedOps: number;
  /** 复杂度类 */
  complexityClass: string;
}

export interface IComplexityAnalysisService {
  estimateComplexity(
    nCandidates: number,
    nFeasible: number,
    horizon?: number,
  ): ComplexityReport;
}
