/**
 * UCB 访问追踪服务
 *
 * 专利 3.6.2 定理 5：Regret(T) = O(log T)
 * 追踪 N_a（动作被选次数）与 T（总轮次），支持 UCB 探索项
 *
 * 参考：docs/Decision_OS_技术交底书.md 3.6.2
 */

import { Injectable } from '@nestjs/common';
import { IUCBVisitTrackerService } from './ucb-visit-tracker.interface';

@Injectable()
export class UCBVisitTrackerService implements IUCBVisitTrackerService {
  private readonly visitCounts: Map<string, number> = new Map();
  private totalRounds = 0;

  recordSelection(actionId: string): void {
    this.totalRounds += 1;
    const prev = this.visitCounts.get(actionId) ?? 0;
    this.visitCounts.set(actionId, prev + 1);
  }

  getVisitCount(actionId: string): number {
    return this.visitCounts.get(actionId) ?? 0;
  }

  getTotalRounds(): number {
    return this.totalRounds;
  }

  /** UCB 探索项 c·√(ln(T+1)/(N_a+1))，默认 c=2 */
  getUCBBonus(actionId: string, c = 2): number {
    const T = this.totalRounds;
    const Na = this.getVisitCount(actionId) + 1;
    if (T <= 0) return c * Math.sqrt(Math.log(2) / Na);
    return c * Math.sqrt(Math.log(T + 1) / Na);
  }
}
