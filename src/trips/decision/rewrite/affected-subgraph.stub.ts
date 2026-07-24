/**
 * P3-2 占位：受影响 temporal 子图 — 后续实现 resolveAffectedTemporalSubgraph(plan, anchor)。
 * 禁止在全 simulation 路径上默认 full generatePlan。
 */

import type { ISODate } from '../world-model';
import { resolveAffectedTemporalSubgraph } from './resolve-affected-temporal-subgraph';

export interface AffectedTemporalSubgraph {
  /** 需重算的日历日（含跨日 spill 下游） */
  dates: ISODate[];
  /** 牵连槽位 id */
  slotIds: string[];
}

/**
 * @deprecated 使用 `resolveAffectedTemporalSubgraph`（沿 unifiedConstraintGraph BFS）。
 */
export function resolveAffectedTemporalSubgraphPlaceholder(anchor: {
  dates: ISODate[];
  seedSlotIds?: string[];
}): AffectedTemporalSubgraph {
  return resolveAffectedTemporalSubgraph({ anchor });
}
