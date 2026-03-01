/**
 * Regret 追踪服务
 *
 * 专利 4.14.4：Regret(T) → 0，E[U(π*) − U(π_t)] ≤ O(1/√T)
 * 记录每轮效用，估计 U*，计算累计 Regret 与理论界
 *
 * 参考：docs/Decision_OS_技术交底书.md 4.14.4
 */

import { Injectable } from '@nestjs/common';
import { IRegretTrackerService } from './regret-tracker.interface';

@Injectable()
export class RegretTrackerService implements IRegretTrackerService {
  private readonly utilities: Map<number, number> = new Map();
  private maxRound = 0;

  recordUtility(round: number, utility: number): void {
    this.utilities.set(round, utility);
    if (round > this.maxRound) this.maxRound = round;
  }

  /** U* 估计：历史最大效用 */
  private estimateOptimalUtility(upToRound: number): number {
    let best = -Infinity;
    for (let t = 1; t <= upToRound; t++) {
      const u = this.utilities.get(t);
      if (u !== undefined && u > best) best = u;
    }
    return best === -Infinity ? 0 : best;
  }

  getCumulativeRegret(T: number): number {
    const uStar = this.estimateOptimalUtility(T);
    let regret = 0;
    for (let t = 1; t <= T; t++) {
      const u = this.utilities.get(t);
      if (u !== undefined) regret += Math.max(0, uStar - u);
    }
    return regret;
  }

  /** 理论界 c/√T，c 为常数（典型值 1~2） */
  getTheoreticalBound(T: number, coefficient = 1.5): number {
    if (T <= 0) return Infinity;
    return coefficient / Math.sqrt(T);
  }
}
