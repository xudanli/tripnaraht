/**
 * Lyapunov 决策系统稳定性接口
 *
 * 专利 3.13.14：V_k = E[U* − U(π_k)]，若 V_{k+1} ≤ V_k 则渐近稳定
 *
 * 参考：docs/Decision_OS_技术交底书.md 3.13.14
 */

export interface LyapunovInput {
  /** 最优效用 U*（或当前估计上界） */
  optimalUtility: number;
  /** 当前策略效用 U(π_k) */
  currentUtility: number;
}

export interface LyapunovResult {
  /** V_k = E[U* − U(π_k)] */
  value: number;
  /** 是否满足 V_{k+1} ≤ V_k（需与历史比较） */
  stable?: boolean;
}

export interface ILyapunovStabilityService {
  /** 计算 Lyapunov 函数值 V_k */
  computeLyapunov(input: LyapunovInput): number;
  /** 检查稳定性：V_new ≤ V_prev */
  checkStability(vNew: number, vPrev: number): boolean;
}
