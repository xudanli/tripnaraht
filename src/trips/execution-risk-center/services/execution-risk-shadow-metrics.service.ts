import { Injectable } from '@nestjs/common';
import type { ExecutionRiskShadowComparison } from '../shadow/execution-risk-shadow-compare.types';
import type { ExecutionRiskShadowMetricsSnapshot } from '../shadow/execution-risk-shadow-compare.types';

@Injectable()
export class ExecutionRiskShadowMetricsService {
  private comparedTotal = 0;
  private divergedTotal = 0;
  private readonly byDivergenceKind = new Map<string, number>();
  private readonly recentComparisons: ExecutionRiskShadowComparison[] = [];
  private readonly maxRecent = 50;

  recordComparison(comparison: ExecutionRiskShadowComparison): void {
    this.comparedTotal += 1;
    if (comparison.diverged) {
      this.divergedTotal += 1;
      const kinds = comparison.divergenceKinds?.length
        ? comparison.divergenceKinds
        : [comparison.divergenceKind];
      for (const kind of kinds) {
        if (kind === 'ALIGNED') continue;
        this.byDivergenceKind.set(kind, (this.byDivergenceKind.get(kind) ?? 0) + 1);
      }
    }

    this.recentComparisons.unshift(comparison);
    if (this.recentComparisons.length > this.maxRecent) {
      this.recentComparisons.length = this.maxRecent;
    }
  }

  snapshot(): ExecutionRiskShadowMetricsSnapshot {
    return {
      comparedTotal: this.comparedTotal,
      divergedTotal: this.divergedTotal,
      byDivergenceKind: Object.fromEntries(this.byDivergenceKind.entries()),
    };
  }

  recent(limit = 10): ExecutionRiskShadowComparison[] {
    return this.recentComparisons.slice(0, limit);
  }
}
