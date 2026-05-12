/**
 * Iceland road MVP impact → 既有 SEMANTIC_DELTA（ROAD_CONSTRAINT_CHANGE）契约
 */

import type { SemanticDeltaEvent } from '../trips/decision/execution/semantic-delta-event.types';
import type { RoadConstraintImpact } from './road-constraint.propagation';

export function roadConstraintImpactToSemanticDeltaEvent(
  impact: RoadConstraintImpact,
  triggerRoadIds: readonly string[],
): SemanticDeltaEvent {
  const severity = impact.severity === 'HIGH' ? 'STRUCTURAL' : 'ADVISORY';
  return {
    kind: 'ROAD_CONSTRAINT_CHANGE',
    payload: {
      triggerRoadIds: [...triggerRoadIds],
      affectedPoiIds: [...impact.affectedPOIs],
      affectedSegmentIds: [...impact.blockedRoads],
      severity,
      replanRequired: impact.requiresReplan,
      affectedDates: [],
    },
    impact: {
      affectedDomains: ['PHYSICAL', 'ROUTING'],
      impactScope: 'GLOBAL',
    },
  };
}
