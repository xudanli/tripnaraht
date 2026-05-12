/**
 * RoadImpact — 图传播层对外唯一建议形状（只读；禁止写 SSOT / 禁止 merge Trip）。
 * 由 `RoadConstraintImpact` 映射而来，供语义层做投影。
 */

import type { RoadConstraintImpact } from './road-constraint.propagation';

export interface RoadImpact {
  readonly affectedPoiIds: readonly string[];
  readonly severity: 'LOW' | 'MEDIUM' | 'HIGH';
  readonly blockedRoadIds: readonly string[];
  readonly requiresReplan: boolean;
  /**
   * 绕行/替代拓扑候选（MVP：与硬阻断路段对齐；后续可由路由引擎填充）
   */
  readonly rerouteCandidates: readonly string[];
}

export function roadConstraintImpactToRoadImpact(
  impact: RoadConstraintImpact,
): RoadImpact {
  return {
    affectedPoiIds: [...impact.affectedPOIs],
    severity: impact.severity,
    blockedRoadIds: [...impact.blockedRoads],
    requiresReplan: impact.requiresReplan,
    rerouteCandidates: [...impact.blockedRoads],
  };
}
