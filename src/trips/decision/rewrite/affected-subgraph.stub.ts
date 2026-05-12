/**
 * P3-2 占位：受影响 temporal 子图 — 后续实现 resolveAffectedTemporalSubgraph(plan, anchor)。
 * 禁止在全 simulation 路径上默认 full generatePlan。
 */

import type { ISODate } from '../world-model';

export interface AffectedTemporalSubgraph {
  /** 需重算的日历日（含跨日 spill 下游） */
  dates: ISODate[];
  /** 牵连槽位 id */
  slotIds: string[];
}

/**
 * v0：占位返回输入锚点；真正的 resolver 应沿 unifiedConstraintGraph + drift 链展开。
 */
export function resolveAffectedTemporalSubgraphPlaceholder(_anchor: {
  dates: ISODate[];
  seedSlotIds?: string[];
}): AffectedTemporalSubgraph {
  return {
    dates: [..._anchor.dates],
    slotIds: [...(_anchor.seedSlotIds ?? [])],
  };
}
