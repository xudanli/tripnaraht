import { Injectable, Optional } from '@nestjs/common';
import type { RoadConstraintGraph } from './road-constraint.graph';
import { getDefaultIcelandRoadConstraintGraph } from './road-constraint.graph';
import {
  propagateRoadConstraint,
  type RoadConstraintEvent,
  type RoadConstraintImpact,
} from './road-constraint.propagation';
import { roadConstraintImpactToSemanticDeltaEvent } from './road-constraint-semantic.adapter';

/**
 * 冰岛路网约束传播（MVP）：依赖图内存驻留 + 事件→影响→语义 delta
 */
@Injectable()
export class IcelandRoadConstraintPropagationService {
  private readonly graph: RoadConstraintGraph;

  constructor(@Optional() graphOverride?: RoadConstraintGraph) {
    this.graph = graphOverride ?? getDefaultIcelandRoadConstraintGraph();
  }

  propagate(event: RoadConstraintEvent): RoadConstraintImpact {
    return propagateRoadConstraint(this.graph, event);
  }

  /** 一步产出可与 semantic-runtime-reducer 拼接的 delta */
  toSemanticDelta(event: RoadConstraintEvent) {
    const impact = this.propagate(event);
    const delta = roadConstraintImpactToSemanticDeltaEvent(impact, [
      event.roadId.trim(),
    ]);
    return { impact, delta };
  }
}
