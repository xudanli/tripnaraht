/**
 * 路网约束传播：RoadStatus → 依赖图遍历 → 受影响 POI / 是否触发语义重建
 */

import type { ISODate } from '../world-model';
import type { RoadAccessState } from '../../../domain/ontology/validator/road-status-contract.types';
import type { VehicleClass } from '../hazard/travel-hazard.types';
import type { RoadDependencyGraph } from './road-dependency-graph.types';

export interface RoadStatusUpdateInput {
  readonly roadId: string;
  readonly accessState: RoadAccessState;
}

export interface RoadConstraintPropagationContextV0 {
  /** 当前计划覆盖的日期（写入 ConstraintImpact，供 temporal / replan） */
  readonly planDates?: readonly ISODate[];
  /**
   * 已知车型时：RESTRICTED_4WD 仅对非四驱能力车型触发硬传播；
   * 未设置时：RESTRICTED_4WD 仅产生软影响（仍列出 dependent POI，不强制 replan）。
   */
  readonly vehicleClass?: VehicleClass;
}

export interface ConstraintImpactV0 {
  readonly affectedPOIs: readonly string[];
  readonly affectedSegments: readonly string[];
  readonly affectedDays: readonly ISODate[];
  readonly severity: 'ADVISORY' | 'STRUCTURAL';
  readonly replanRequired: boolean;
  readonly triggerRoadIds: readonly string[];
}

type PropagationStrength = 'none' | 'soft' | 'hard';

function classifyPropagation(
  access: RoadAccessState,
  ctx?: RoadConstraintPropagationContextV0,
): PropagationStrength {
  if (access === 'OPEN') return 'none';
  if (
    access === 'IMPASSABLE' ||
    access === 'SEASONAL_CLOSED' ||
    access === 'FLOOD_RISK'
  ) {
    return 'hard';
  }
  if (access === 'RESTRICTED_4WD') {
    if (!ctx?.vehicleClass) return 'soft';
    if (ctx.vehicleClass === 'SUV_4WD') return 'none';
    return 'hard';
  }
  return 'none';
}

/**
 * 单向量闭合：对每个路况更新，展开图中对应节点的 dependentPOIs。
 */
export function propagateRoadConstraintsV0(
  updates: readonly RoadStatusUpdateInput[],
  graph: RoadDependencyGraph,
  ctx?: RoadConstraintPropagationContextV0,
): ConstraintImpactV0 {
  const affectedPOIs = new Set<string>();
  const affectedSegments = new Set<string>();
  let maxSeverity: 'ADVISORY' | 'STRUCTURAL' = 'ADVISORY';
  let replanRequired = false;

  for (const u of updates) {
    const node = graph.segments.find(
      (s) => s.roadId.toUpperCase() === u.roadId.trim().toUpperCase(),
    );
    if (!node) continue;

    const strength = classifyPropagation(u.accessState, ctx);
    if (strength === 'none') continue;

    affectedSegments.add(u.roadId.trim());
    for (const p of node.dependentPOIs) {
      affectedPOIs.add(p);
    }
    if (strength === 'hard') {
      maxSeverity = 'STRUCTURAL';
      replanRequired = true;
    }
  }

  const affectedDays = ctx?.planDates?.length ? [...ctx.planDates] : [];

  return {
    affectedPOIs: [...affectedPOIs],
    affectedSegments: [...affectedSegments],
    affectedDays,
    severity: maxSeverity,
    replanRequired,
    triggerRoadIds: updates.map((x) => x.roadId.trim()),
  };
}
