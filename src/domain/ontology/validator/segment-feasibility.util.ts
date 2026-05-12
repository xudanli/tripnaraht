/**
 * Pure segment × POI feasibility checks (same semantics as SpatialDomainAdmin POST .../validate-feasibility).
 */

import { ICELAND_F_ROAD_POLICY_SOURCE, isIcelandHighlandFRoadSeasonallyClosed } from './iceland-f-road-policy.util';
import type { SegmentLatestRoadStatusV1 } from './road-status-contract.types';
import {
  inferRoadAccessFromSurfaceCondition,
  liveLatestStatusBlocksSegment,
  parseRoadSurfaceCondition,
} from './road-status-contract.types';

export interface SegmentFeasibilityPoiLike {
  closed?: boolean;
  time_windows?: Array<{
    weekday: string;
    open: string;
    close: string;
  }>;
}

export interface SegmentFeasibilitySegmentLike {
  segment_type?: string;
  road_condition?: { status?: string };
  /** EnvSyncWorker → SpatialDomainSegment.latest_status (Road.is / mock). */
  latest_status?: SegmentLatestRoadStatusV1 | Record<string, unknown>;
  seasonal_closures?: Array<{ start: string; end: string }>;
  evidence?: { url?: string; source?: string } | Record<string, unknown>;
}

export function computeSegmentFeasibilityViolations(params: {
  segment: SegmentFeasibilitySegmentLike;
  toPoi: SegmentFeasibilityPoiLike | null;
  enterAt: Date;
  vehicleType?: 'SEDAN' | 'SUV' | 'FOUR_BY_FOUR';
}): { violations: string[]; facts: Record<string, unknown> } {
  const { segment, toPoi, enterAt, vehicleType } = params;
  const violations: string[] = [];

  const roadStatus = segment.road_condition?.status ?? 'OPEN';
  const staticRoadClosed = roadStatus === 'CLOSED';

  const ls = segment.latest_status as SegmentLatestRoadStatusV1 | undefined;
  const liveCondition = ls?.condition != null ? parseRoadSurfaceCondition(ls.condition) : undefined;
  const liveAccessState = ls
    ? ls.accessState ??
      inferRoadAccessFromSurfaceCondition(liveCondition ?? 'UNKNOWN')
    : undefined;
  const roadIsBlocking = liveLatestStatusBlocksSegment(ls, vehicleType);

  /** Union: static admin road_condition OR live Road.is snapshot — any CLOSED-class condition blocks. */
  if (staticRoadClosed || roadIsBlocking) violations.push('SEGMENT_ROAD_CLOSED');

  const dbSeasonalClosures = segment.seasonal_closures ?? [];
  const seasonalBlocked = dbSeasonalClosures.some((x) => {
    const start = new Date(x.start);
    const end = new Date(x.end);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return false;
    return enterAt >= start && enterAt <= end;
  });
  if (seasonalBlocked) violations.push('SEGMENT_SEASONALLY_CLOSED');

  /**
   * Road.is 未接入时：F-Road 且 DB 未命中任一 seasonal_closure 窗口 → 用冰岛高地典型季历（例如 5 月内陆 → 封闭 / INTERRUPT）。
   * 若 DB 已命中封闭窗，以上分支已 emit，此处不再叠加。
   */
  let icelandPolicySeasonallyClosed = false;
  if (segment.segment_type === 'F_ROAD' && !seasonalBlocked) {
    icelandPolicySeasonallyClosed = isIcelandHighlandFRoadSeasonallyClosed(enterAt);
    if (icelandPolicySeasonallyClosed) violations.push('SEGMENT_SEASONALLY_CLOSED');
  }

  if (segment.segment_type === 'F_ROAD' && vehicleType && vehicleType !== 'FOUR_BY_FOUR') {
    violations.push('SEGMENT_REQUIRES_4X4');
  }

  const endpointOpen = toPoi ? isPoiOpenAt(toPoi, enterAt) : true;
  if (!endpointOpen) violations.push('POI_CLOSED_AT_ETA');

  const deduped = [...new Set(violations)];

  return {
    violations: deduped,
    facts: {
      segmentType: segment.segment_type,
      roadStatus,
      staticRoadClosed,
      seasonalBlocked,
      icelandPolicySeasonallyClosed,
      ...(icelandPolicySeasonallyClosed ? { road_policy_source: ICELAND_F_ROAD_POLICY_SOURCE } : {}),
      ...(ls
        ? {
            ...(liveCondition != null ? { roadIsCondition: liveCondition } : {}),
            roadIsAccessState: liveAccessState,
            roadIsBlocking,
            roadIsConditionText: typeof ls.condition_text === 'string' ? ls.condition_text : undefined,
            roadIsSourceUrl: typeof ls.source_url === 'string' ? ls.source_url : undefined,
          }
        : {}),
      endpointReachable: endpointOpen,
    },
  };
}

function isValidHm(value: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

function toMinute(value: string): number {
  const [h, m] = value.split(':').map((x) => Number(x));
  return h * 60 + m;
}

function matchWeekday(expr: string, day: string): boolean {
  const normalized = expr.trim().toUpperCase();
  if (normalized === 'DAILY') return true;
  if (normalized.includes('-')) {
    const [start, end] = normalized.split('-');
    const order = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
    const idx = order.indexOf(day);
    const startIdx = order.indexOf(start);
    const endIdx = order.indexOf(end);
    if (idx < 0 || startIdx < 0 || endIdx < 0) return false;
    if (startIdx <= endIdx) return idx >= startIdx && idx <= endIdx;
    return idx >= startIdx || idx <= endIdx;
  }
  return normalized === day;
}

export function isPoiOpenAt(poi: SegmentFeasibilityPoiLike, at: Date): boolean {
  if (poi.closed) return false;
  const windows = poi.time_windows ?? [];
  if (windows.length === 0) return true;
  const day = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'][at.getUTCDay()];
  const nowMinute = at.getUTCHours() * 60 + at.getUTCMinutes();
  return windows.some((w) => {
    if (!matchWeekday(w.weekday, day)) return false;
    if (!isValidHm(w.open) || !isValidHm(w.close)) return false;
    const open = toMinute(w.open);
    const close = toMinute(w.close);
    return nowMinute >= open && nowMinute <= close;
  });
}
