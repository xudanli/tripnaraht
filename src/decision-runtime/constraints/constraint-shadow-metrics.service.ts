/**
 * Records CONSTRAINT_GATEWAY_MODE=SHADOW_COMPARE divergence for ops / Prometheus.
 */

import { Injectable, Optional } from '@nestjs/common';
import { PrometheusMetricsService } from '../../monitoring/prometheus-metrics.service';
import type { ConstraintEvaluationShadowComparison } from './constraint-evaluation-shadow-compare.util';

export interface ConstraintShadowMetricsSnapshot {
  comparedTotal: number;
  divergedTotal: number;
  byDivergenceKind: Record<string, number>;
}

@Injectable()
export class ConstraintShadowMetricsService {
  private comparedTotal = 0;
  private divergedTotal = 0;
  private readonly byDivergenceKind = new Map<string, number>();

  constructor(
    @Optional() private readonly prometheus?: PrometheusMetricsService,
  ) {}

  recordComparison(comparison: ConstraintEvaluationShadowComparison): void {
    this.comparedTotal += 1;
    if (comparison.diverged) {
      this.divergedTotal += 1;
      const kind = comparison.divergenceKind;
      this.byDivergenceKind.set(kind, (this.byDivergenceKind.get(kind) ?? 0) + 1);
    }

    this.prometheus?.recordConstraintShadowComparison(comparison);
  }

  snapshot(): ConstraintShadowMetricsSnapshot {
    return {
      comparedTotal: this.comparedTotal,
      divergedTotal: this.divergedTotal,
      byDivergenceKind: Object.fromEntries(this.byDivergenceKind.entries()),
    };
  }
}
