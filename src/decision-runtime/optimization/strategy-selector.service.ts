/**
 * Strategy selection by problem profile — production and lab share selector logic.
 * @see ADR-007-Decision-Runtime-v2.md
 */

import { Injectable, Logger } from '@nestjs/common';
import type { OptimizationStrategy, OptimizationStrategyId } from './optimization-strategy.interface';
import type { OptimizationProblemProfile } from '../contracts/optimization-problem';
import { resolveOptimizationStrategyMode, type OptimizationStrategyMode } from '../constraints/constraint-evaluation.config';

const FORCED_STRATEGY: Partial<Record<OptimizationStrategyMode, OptimizationStrategyId>> = {
  LEGACY: 'legacy-frozen',
  WEIGHTED: 'weighted-score',
  CPSAT_LEX: 'cp-sat-lexicographic',
  CPSAT_EPSILON: 'cp-sat-epsilon',
};

@Injectable()
export class OptimizationStrategySelectorService {
  private readonly logger = new Logger(OptimizationStrategySelectorService.name);
  private readonly strategies = new Map<OptimizationStrategyId, OptimizationStrategy>();

  register(strategy: OptimizationStrategy): void {
    this.strategies.set(strategy.strategyId, strategy);
  }

  select(profile: OptimizationProblemProfile): OptimizationStrategy | null {
    const mode = resolveOptimizationStrategyMode();
    if (mode !== 'AUTO') {
      const forcedId = FORCED_STRATEGY[mode];
      if (forcedId) {
        const forced = this.strategies.get(forcedId);
        if (forced?.supports(profile)) return forced;
      }
      this.logger.warn(`Forced strategy ${mode} unavailable for profile; falling back to AUTO`);
    }

    if (profile.disruptionScope === 'LOCAL') {
      const bounded = this.strategies.get('bounded-lns-repair');
      if (bounded?.supports(profile)) return bounded;
    }

    const order: OptimizationStrategyId[] = [
      'legacy-frozen',
      'weighted-score',
      'cp-sat-lexicographic',
      'cp-sat-epsilon',
      'bounded-lns-repair',
      'rule-fallback',
    ];

    for (const id of order) {
      const strategy = this.strategies.get(id);
      if (strategy?.supports(profile)) return strategy;
    }
    return null;
  }
}
