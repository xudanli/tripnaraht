import { Injectable, Optional } from '@nestjs/common';
import { PrometheusMetricsService } from '../../../monitoring/prometheus-metrics.service';
import type { RoadSurfaceCondition } from '../../../domain/ontology/validator/road-status-contract.types';
import {
  inferRoadAccessFromSurfaceCondition,
} from '../../../domain/ontology/validator/road-status-contract.types';
import type { ISODate } from '../world-model';
import type { VehicleClass } from '../hazard/travel-hazard.types';
import { ICELAND_ROAD_DEPENDENCY_GRAPH_V0 } from './iceland-road-dependency-graph.v0';
import type { RoadDependencyGraph } from './road-dependency-graph.types';
import {
  propagateRoadConstraintsV0,
  type ConstraintImpactV0,
  type RoadConstraintPropagationContextV0,
  type RoadStatusUpdateInput,
} from './road-constraint-propagation';
import { roadConstraintImpactToSemanticDeltaV0 } from './road-constraint-semantic-bridge';

export type IcelandRoadConditionUpdate = {
  roadId: string;
  condition: RoadSurfaceCondition;
};

/**
 * 路网约束传播（冰岛 v0 图内置于 `data/constraints/iceland-road-dependency.v0.json`）。
 */
@Injectable()
export class RoadConstraintPropagationService {
  private readonly graph: RoadDependencyGraph;

  /** 注入可选图以便测试或多国家扩展 */
  constructor(
    @Optional() graphOverride?: RoadDependencyGraph,
    @Optional() private readonly promMetrics?: PrometheusMetricsService,
  ) {
    this.graph = graphOverride ?? ICELAND_ROAD_DEPENDENCY_GRAPH_V0;
  }

  propagateFromAccessUpdates(
    updates: readonly RoadStatusUpdateInput[],
    ctx?: RoadConstraintPropagationContextV0,
  ): ConstraintImpactV0 {
    const t0 = Date.now();
    try {
      return propagateRoadConstraintsV0(updates, this.graph, ctx);
    } finally {
      this.promMetrics?.observeOpsRouteConstraintPropagationSeconds((Date.now() - t0) / 1000);
    }
  }

  /** 从实况 RoadSurfaceCondition 推导 accessState 再传播 */
  propagateFromSurfaceConditions(
    updates: readonly IcelandRoadConditionUpdate[],
    ctx?: RoadConstraintPropagationContextV0 & {
      planDates?: readonly ISODate[];
      vehicleClass?: VehicleClass;
    },
  ): ConstraintImpactV0 {
    const t0 = Date.now();
    try {
      const mapped: RoadStatusUpdateInput[] = updates.map((u) => ({
        roadId: u.roadId,
        accessState: inferRoadAccessFromSurfaceCondition(u.condition),
      }));
      return propagateRoadConstraintsV0(mapped, this.graph, ctx);
    } finally {
      this.promMetrics?.observeOpsRouteConstraintPropagationSeconds((Date.now() - t0) / 1000);
    }
  }

  toSemanticDeltaV0(impact: ConstraintImpactV0) {
    return roadConstraintImpactToSemanticDeltaV0(impact);
  }

  getGraphVersion(): string {
    return this.graph.version;
  }
}
