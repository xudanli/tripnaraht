/**
 * Partial Replan 时空因果锥 — 卡片拖拽/POI REPLACEMENT 的局部重算作用域。
 *
 * 与 `computeIncrementalResearchScopes` 互补：前者定 Research 失效域，本模块定 Plan 重算冻结边界。
 */

import type { PlanDeltaIR } from '../contracts/plan-delta-ir.types';

export interface PartialReplanScope {
  /** 触发重算的锚定天（0-based） */
  anchorDayIndex: number;
  /** 需局部重算的天范围（含端点，0-based） */
  replanDayRange: { from: number; to: number };
  /** 冻结不变的天索引（锚定前 + 锥后） */
  frozenDayIndices: number[];
  /** 预估局部重算延迟（ms），供 SLA 门禁 */
  estimatedLatencyMs: number;
  reason: string;
}

const PARTIAL_REPLAN_BASE_MS = 80;
const PARTIAL_REPLAN_PER_DAY_MS = 120;

function estimatePartialReplanLatencyMs(daySpan: number): number {
  const span = Math.max(1, daySpan);
  return PARTIAL_REPLAN_BASE_MS + span * PARTIAL_REPLAN_PER_DAY_MS;
}

function findAnchorPoiDelta(deltas: readonly PlanDeltaIR[]): PlanDeltaIR | undefined {
  return deltas.find(
    (d) =>
      d.target.type === 'POI' &&
      d.target.dayIndex !== undefined &&
      (d.op === 'REPLACE' || d.op === 'ADD' || d.op === 'REMOVE'),
  );
}

/**
 * 以 POI delta 为中心向后辐射时空锥；锚定前日与锥后日冻结。
 *
 * 例：D3（index=2）REPLACE → 重算 day 2–3，冻结 day 0–1 与 day 4+。
 */
export function computePartialReplanScope(
  deltas: readonly PlanDeltaIR[],
  options?: { totalDays?: number; forwardConeDays?: number },
): PartialReplanScope | null {
  const anchorDelta = findAnchorPoiDelta(deltas);
  if (!anchorDelta || anchorDelta.target.dayIndex === undefined) {
    return null;
  }

  const anchorDayIndex = anchorDelta.target.dayIndex;
  const forwardConeDays = options?.forwardConeDays ?? 1;
  const replanTo = anchorDayIndex + forwardConeDays;

  const frozenBefore = Array.from({ length: anchorDayIndex }, (_, i) => i);

  const totalDays = options?.totalDays;
  const frozenAfter: number[] = [];
  if (totalDays !== undefined && totalDays > 0) {
    for (let d = replanTo + 1; d < totalDays; d += 1) {
      frozenAfter.push(d);
    }
  }

  const daySpan = replanTo - anchorDayIndex + 1;

  return {
    anchorDayIndex,
    replanDayRange: { from: anchorDayIndex, to: replanTo },
    frozenDayIndices: [...frozenBefore, ...frozenAfter],
    estimatedLatencyMs: estimatePartialReplanLatencyMs(daySpan),
    reason: `POI [${anchorDelta.op}] day=${anchorDayIndex} → forward cone to day ${replanTo}`,
  };
}
