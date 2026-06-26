import { Injectable } from '@nestjs/common';
import type { LoopBudgetPolicy } from '../types/loop-definition.types';

@Injectable()
export class LoopBudgetService {
  isWithinTimeBudget(startedAtMs: number, policy: LoopBudgetPolicy): boolean {
    if (!policy.timeBudgetMs) return true;
    return Date.now() - startedAtMs <= policy.timeBudgetMs;
  }

  isWithinIterationBudget(iteration: number, policy: LoopBudgetPolicy): boolean {
    return iteration < policy.maxIterations;
  }

  estimateRemainingIterations(current: number, policy: LoopBudgetPolicy): number {
    return Math.max(0, policy.maxIterations - current);
  }
}
