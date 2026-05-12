/**
 * Constraint propagation MVP：纯计算 — 单路段事件 → 受影响 POI / 封路 / replan 意图。
 * 不写 TripPlan、不写 SSOT；落地事实请经 `applyRoadFactMutation`（world-mutation.gateway）。
 */

import type { RoadAccessState } from '../domain/ontology/validator/road-status-contract.types';
import type {
  RoadConstraintGraph,
  RoadConstraintVehicleConstraint,
} from './road-constraint.graph';
import { normalizeRoadId } from './road-constraint.graph';

export interface RoadConstraintEvent {
  readonly roadId: string;
  readonly status: RoadAccessState;
  readonly vehicleConstraint?: RoadConstraintVehicleConstraint;
}

export interface RoadConstraintImpact {
  readonly affectedPOIs: readonly string[];
  readonly blockedRoads: readonly string[];
  readonly severity: 'LOW' | 'MEDIUM' | 'HIGH';
  readonly requiresReplan: boolean;
}

export function propagateRoadConstraint(
  graph: RoadConstraintGraph,
  event: RoadConstraintEvent,
): RoadConstraintImpact {
  const id = normalizeRoadId(event.roadId);
  const node = graph.nodes.get(id);
  if (!node) {
    return {
      affectedPOIs: [],
      blockedRoads: [],
      severity: 'LOW',
      requiresReplan: false,
    };
  }

  const st = event.status;
  const isHardBlock =
    st === 'IMPASSABLE' ||
    st === 'SEASONAL_CLOSED' ||
    st === 'FLOOD_RISK';

  if (isHardBlock) {
    return {
      affectedPOIs: [...node.connectedPOIs],
      blockedRoads: [id],
      severity: 'HIGH',
      requiresReplan: true,
    };
  }

  if (st === 'RESTRICTED_4WD') {
    return {
      affectedPOIs: [...node.connectedPOIs],
      blockedRoads: [],
      severity: 'MEDIUM',
      requiresReplan: false,
    };
  }

  return {
    affectedPOIs: [],
    blockedRoads: [],
    severity: 'LOW',
    requiresReplan: false,
  };
}
