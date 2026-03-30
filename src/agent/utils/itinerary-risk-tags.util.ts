/**
 * ADR-B1：由 VERIFY/REPAIR 信号推导并合并 `ItineraryItem.metadata.risk_tags` / `risk_level`
 */

import type {
  Itinerary,
  ItineraryItem,
  ItineraryRiskTag,
  RequiredAdjustment,
} from '../interfaces/trip-plan.interface';

/** 与 `ItineraryVerifyOutput.issues[].type` 对齐 */
export type VerifyIssueType =
  | 'OPENING_HOURS_CONFLICT'
  | 'TRANSFER_BUFFER_INSUFFICIENT'
  | 'REACHABILITY_ISSUE'
  | 'FATIGUE_THRESHOLD_EXCEEDED'
  | 'TIME_WINDOW_OVERLAP';

export function riskTagFromVerifyIssueType(type: VerifyIssueType): ItineraryRiskTag {
  switch (type) {
    case 'OPENING_HOURS_CONFLICT':
    case 'TRANSFER_BUFFER_INSUFFICIENT':
    case 'TIME_WINDOW_OVERLAP':
      return 'LOGISTICS';
    case 'REACHABILITY_ISSUE':
      return 'SAFETY';
    case 'FATIGUE_THRESHOLD_EXCEEDED':
      return 'HEALTH';
    default: {
      const _ex: never = type;
      return _ex;
    }
  }
}

/** REPAIR 调整动作到风险标签的默认映射 */
export function riskTagFromAdjustmentAction(action: RequiredAdjustment['action']): ItineraryRiskTag {
  switch (action) {
    case 'REPLACE_POI':
    case 'REPLACE_SEGMENT':
    case 'CHANGE_TRANSPORT':
    case 'ADD_BUFFER':
    case 'SHORTEN_DAY':
    case 'CHANGE_DATES':
      return 'LOGISTICS';
    case 'CHANGE_MODE':
      return 'SAFETY';
    default: {
      const _ex: never = action;
      return _ex;
    }
  }
}

const RISK_LEVEL_ORDER: Record<'LOW' | 'MEDIUM' | 'HIGH', number> = {
  LOW: 0,
  MEDIUM: 1,
  HIGH: 2,
};

function mergeTag(meta: NonNullable<ItineraryItem['metadata']>, tag: ItineraryRiskTag): void {
  const cur = meta.risk_tags ?? [];
  if (!cur.includes(tag)) {
    meta.risk_tags = [...cur, tag];
  }
}

function bumpRiskLevel(
  meta: NonNullable<ItineraryItem['metadata']>,
  severity: 'ERROR' | 'WARNING',
): void {
  const candidate: 'MEDIUM' | 'HIGH' = severity === 'ERROR' ? 'HIGH' : 'MEDIUM';
  const cur = meta.risk_level ?? 'LOW';
  if (RISK_LEVEL_ORDER[candidate] > RISK_LEVEL_ORDER[cur]) {
    meta.risk_level = candidate;
  }
}

function ensureItemMetadata(item: ItineraryItem): NonNullable<ItineraryItem['metadata']> {
  if (!item.metadata) {
    item.metadata = {};
  }
  return item.metadata;
}

/**
 * 按 `item_id` 将验证问题映射为风险标签与严重度摘要（原地修改 itinerary）。
 */
export function applyRiskTagsFromVerifyIssues(
  itinerary: Itinerary,
  issues: Array<{
    type: VerifyIssueType;
    severity: 'ERROR' | 'WARNING';
    item_id?: string;
  }>,
): void {
  const byItem = new Map<string, Array<{ type: VerifyIssueType; severity: 'ERROR' | 'WARNING' }>>();
  for (const i of issues) {
    if (!i.item_id) continue;
    const list = byItem.get(i.item_id) ?? [];
    list.push({ type: i.type, severity: i.severity });
    byItem.set(i.item_id, list);
  }
  for (const day of itinerary.days) {
    for (const item of day.items) {
      const list = byItem.get(item.id);
      if (!list?.length) continue;
      const meta = ensureItemMetadata(item);
      for (const iss of list) {
        mergeTag(meta, riskTagFromVerifyIssueType(iss.type));
        bumpRiskLevel(meta, iss.severity);
      }
    }
  }
}

/**
 * 由 REPAIR 调整对目标 item 打标签（原地修改 itinerary）。
 * 说明：
 * - 仅处理能定位到 item/POI 的调整（target 命中 item.id 或 place_id）。
 * - 当前默认将 REPAIR 标记为 WARNING 级（至少提升到 MEDIUM）。
 */
export function applyRiskTagsFromAdjustments(
  itinerary: Itinerary,
  adjustments: RequiredAdjustment[],
): void {
  if (!adjustments.length) return;
  for (const adj of adjustments) {
    const tag = riskTagFromAdjustmentAction(adj.action);
    const target = adj.target;
    let touched = false;
    for (const day of itinerary.days) {
      for (const item of day.items) {
        if (
          target &&
          item.id !== target &&
          item.location_ref?.place_id !== target
        ) {
          continue;
        }
        const meta = ensureItemMetadata(item);
        mergeTag(meta, tag);
        bumpRiskLevel(meta, 'WARNING');
        touched = true;
      }
    }
    // 无 target 时按全局调整处理：至少对 TRANSIT/POI 打标签
    if (!touched && !target) {
      for (const day of itinerary.days) {
        for (const item of day.items) {
          if (item.type !== 'TRANSIT' && item.type !== 'POI') continue;
          const meta = ensureItemMetadata(item);
          mergeTag(meta, tag);
          bumpRiskLevel(meta, 'WARNING');
        }
      }
    }
  }
}
