/**
 * 世界约束可行性策略 — 单一裁决入口（P3 演进：合并 overlay / objective 中的重复 blocked 判断）
 */

import type {
  ConstraintFeasibilityCode,
  ConstraintFeasibilityResult,
  WorldConstraintFeasibilityInput,
} from './world-constraint-feasibility.types';

function closedRoadFields(input: WorldConstraintFeasibilityInput) {
  return Object.values(input.snapshot.roads).filter((f) => f.state === 'CLOSED');
}

/**
 * 全局裁决：任一 CLOSED 路网 → BLOCK（用于 Neptune / 粗粒度闸门）。
 */
export function evaluateConstraintFeasibility(
  input: WorldConstraintFeasibilityInput,
): ConstraintFeasibilityResult {
  if (closedRoadFields(input).length > 0) {
    return {
      verdict: 'BLOCK',
      codes: ['ROAD_CLOSED_HARD'],
      reasons: ['road_constraint_closed_in_snapshot'],
    };
  }
  return {
    verdict: 'ALLOW',
    codes: ['MVP_STUB_ALLOW'],
    reasons: ['no_hard_road_block_in_snapshot'],
  };
}

export type WorldConstraintFeasibilitySlotInput = WorldConstraintFeasibilityInput & {
  readonly slotId: string;
};

/**
 * 槽位级裁决：仅当某条 CLOSED 路声明 `affectedSlotIds` 含该槽 → BLOCK；
 * 存在 CLOSED 但未映射到该槽 → DEGRADE（保守提示，不把整条 overlay 打成 blocked）。
 */
export function evaluateConstraintFeasibilityForSlot(
  input: WorldConstraintFeasibilitySlotInput,
): ConstraintFeasibilityResult {
  const closed = closedRoadFields(input);
  for (const r of closed) {
    if (r.affectedSlotIds?.includes(input.slotId)) {
      return {
        verdict: 'BLOCK',
        codes: ['ROAD_CLOSED_HARD'],
        reasons: [`road_closed_for_slot_${input.slotId}`],
      };
    }
  }
  if (closed.length > 0) {
    const codes: ConstraintFeasibilityCode[] = ['ROAD_CLOSED_GLOBAL_OR_UNKNOWN'];
    return {
      verdict: 'DEGRADE',
      codes,
      reasons: ['closed_roads_present_without_slot_mapping_for_this_leg'],
    };
  }
  return {
    verdict: 'ALLOW',
    codes: ['MVP_STUB_ALLOW'],
    reasons: ['no_hard_road_block_for_slot'],
  };
}
