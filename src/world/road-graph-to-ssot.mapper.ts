/**
 * 图引擎输出 → `RoadConstraintDiff`（计算器不持有 SSOT、不写 Trip）
 */

import type { RoadAccessState } from '../domain/ontology/validator/road-status-contract.types';
import type {
  RoadConstraintEvent,
  RoadConstraintImpact,
} from '../iceland-road/road-constraint.propagation';
import type { CanonicalRoadWorldState } from './road-canonical.types';
import type { RoadConstraintDiff } from './road-constraint-diff.types';

function impactSeverityToNumber(
  band: RoadConstraintImpact['severity'],
): number {
  if (band === 'HIGH') {
    return 85;
  }
  if (band === 'MEDIUM') {
    return 50;
  }
  return 25;
}

/**
 * 供应商 / 图事件准入态 → 世界规范四态（单一路由表，避免双真相语义分叉）
 */
export function roadAccessStateToCanonical(
  access: RoadAccessState,
): CanonicalRoadWorldState {
  switch (access) {
    case 'OPEN':
      return 'OPEN';
    case 'RESTRICTED_4WD':
      return 'RESTRICTED';
    case 'IMPASSABLE':
    case 'SEASONAL_CLOSED':
    case 'FLOOD_RISK':
      return 'CLOSED';
    default: {
      const _e: never = access;
      return _e;
    }
  }
}

/**
 * MVP 图传播结果 + 原始事件 → 面向 SSOT 的 diff（不含槽位；槽位在 apply 阶段解析）
 */
export function roadConstraintEventAndImpactToDiff(
  event: RoadConstraintEvent,
  impact: RoadConstraintImpact,
): RoadConstraintDiff {
  const state = roadAccessStateToCanonical(event.status);
  return {
    roadId: event.roadId.trim(),
    state,
    severity: impactSeverityToNumber(impact.severity),
    impactedEntities: {
      poiIds: [...impact.affectedPOIs],
      blockedRoadIds: [...impact.blockedRoads],
    },
    requiresReplan: impact.requiresReplan,
  };
}
