/**
 * D4：非标空间锚点（小红书/GPX/机位）插入可行性 — 时间窗与路况冲突预检。
 */

import type {
  SpatialIntentConflict,
  SpatialIntentFeasibilityReport,
} from './planning-intent-processor.util';
import type { TripDaySnapshotForPlacement } from './route-and-run-intent-analyzer.util';
import { stripSystemMessageBlocksForIntakeNl } from './trip-plan-intake-vehicle.util';

const TIGHT_ITEM_THRESHOLD = 5;
const WARN_ITEM_THRESHOLD = 3;

export function extractSpatialTargetDayNumber(text: string): number | undefined {
  const nl = stripSystemMessageBlocksForIntakeNl(text);
  const m = nl.match(/第\s*(\d+)\s*天|day\s*(\d+)/i);
  if (!m) return undefined;
  const n = parseInt(m[1] ?? m[2], 10);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

export function detectSpatialAttachmentType(
  text: string,
): SpatialIntentFeasibilityReport['attachment_type'] {
  const nl = stripSystemMessageBlocksForIntakeNl(text);
  if (/gpx|轨迹|track/i.test(nl)) return 'gpx';
  if (/截图|小红书|instagram|ins/i.test(nl)) return 'image';
  return 'text';
}

export function extractSpatialAnchorLabel(text: string): string | undefined {
  const nl = stripSystemMessageBlocksForIntakeNl(text);
  if (/机位|锚点|小众/.test(nl)) return '非标机位锚点';
  if (/gpx|轨迹/.test(nl)) return 'GPX 轨迹锚点';
  if (/小红书/.test(nl)) return '社区种草锚点';
  return undefined;
}

function findLoosestDay(snapshots: TripDaySnapshotForPlacement[]): number | undefined {
  const sorted = [...snapshots].sort((a, b) => a.itemCount - b.itemCount);
  return sorted[0]?.dayNumber;
}

/**
 * D4 主入口：对目标日做只读 slot 冲突预检（不修改 itinerary 硬字段）。
 */
export function evaluateSpatialIntentFeasibility(params: {
  intakeMsg: string;
  tripDaySnapshots?: TripDaySnapshotForPlacement[];
}): SpatialIntentFeasibilityReport {
  const nl = stripSystemMessageBlocksForIntakeNl(params.intakeMsg);
  const target_day_number = extractSpatialTargetDayNumber(nl);
  const attachment_type = detectSpatialAttachmentType(nl);
  const anchor_label = extractSpatialAnchorLabel(nl);
  const snapshots = params.tripDaySnapshots ?? [];
  const conflicts: SpatialIntentConflict[] = [];

  if (/塌方|土路|下雨|季节性/i.test(nl)) {
    conflicts.push({
      type: 'SEASON_ROAD',
      severity: 'WARN',
      message_zh: '锚点途经非铺装/季节性土路，需纳入路况 Gate 与雨天封路 contingency。',
    });
  }

  const targetSnap = target_day_number
    ? snapshots.find((s) => s.dayNumber === target_day_number)
    : undefined;

  if (targetSnap) {
    if (targetSnap.itemCount >= TIGHT_ITEM_THRESHOLD) {
      conflicts.push({
        type: 'TIME_WINDOW',
        severity: 'BLOCK',
        message_zh: `Day ${target_day_number} 已有 ${targetSnap.itemCount} 个活动，时间窗饱和，直接插入高概率冲突。`,
      });
    } else if (targetSnap.itemCount >= WARN_ITEM_THRESHOLD) {
      conflicts.push({
        type: 'SCHEDULE_TIGHT',
        severity: 'WARN',
        message_zh: `Day ${target_day_number} 行程偏满（${targetSnap.itemCount} 项），插入需预留换乘 buffer。`,
      });
    }
  } else if (target_day_number && snapshots.length > 0) {
    conflicts.push({
      type: 'TIME_WINDOW',
      severity: 'WARN',
      message_zh: `未在已加载行程中找到 Day ${target_day_number} 快照，需绑定 Trip 后复核 slot。`,
    });
  }

  const hasRemoteAnchor = /山谷|无人区|高地|f[\s-]?road|西峡湾/i.test(nl);
  if (hasRemoteAnchor) {
    conflicts.push({
      type: 'DRIVE_BUFFER',
      severity: 'WARN',
      message_zh: '锚点位于偏远走廊，预计需额外车程与驾驶 buffer（建议 ≥40min）。',
    });
  }

  const hasBlock = conflicts.some((c) => c.severity === 'BLOCK');
  const suggested_day_number =
    hasBlock && snapshots.length ? findLoosestDay(snapshots) : undefined;

  let extra_drive_minutes_estimate = 20;
  if (hasRemoteAnchor || /塌方|土路/.test(nl)) {
    extra_drive_minutes_estimate = 40;
  }
  if (attachment_type === 'gpx') {
    extra_drive_minutes_estimate += 15;
  }

  return {
    target_day_number,
    anchor_label,
    attachment_type,
    feasible: !hasBlock,
    conflicts,
    suggested_day_number: hasBlock ? suggested_day_number : target_day_number,
    extra_drive_minutes_estimate,
  };
}
