/**
 * RoadConstraintImpact → SEMANTIC_DELTA（与 semantic-runtime-reducer / Neptune 对齐）
 */

import type { ConstraintImpactV0 } from './road-constraint-propagation';
import type { SemanticDeltaEvent } from '../execution/semantic-delta-event.types';

/** v0：路况约束一律 GLOBAL 陈旧边界（与 Phase3 局部合并前全量 rebuild 路径一致） */
export function roadConstraintImpactToSemanticDeltaV0(
  impact: ConstraintImpactV0,
): SemanticDeltaEvent {
  return {
    kind: 'ROAD_CONSTRAINT_CHANGE',
    payload: {
      triggerRoadIds: impact.triggerRoadIds,
      affectedPoiIds: impact.affectedPOIs,
      affectedSegmentIds: impact.affectedSegments,
      severity: impact.severity,
      replanRequired: impact.replanRequired,
      affectedDates: impact.affectedDays,
    },
    impact: {
      affectedDomains: ['PHYSICAL', 'ROUTING'],
      impactScope: 'GLOBAL',
    },
  };
}
