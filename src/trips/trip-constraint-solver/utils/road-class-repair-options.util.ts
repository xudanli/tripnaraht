import type {
  CoverageMapData,
  ReadinessScoreFinding,
  RepairOptionsResponse,
} from '../../readiness/types/coverage-map.types';
import type { FeasibilityIssueDto } from '../types/trip-constraint-solver.types';
import { normalizeIssueId, resolveIssueIdToBlockerId } from './trip-revision.util';
import {
  GLOBAL_SEGMENT_DISTANCE_THRESHOLDS,
  longDistanceHighMessage,
  longDistanceWarnMessage,
} from './segment-distance-threshold.util';

const ROAD_CLASS_BLOCKER_RE = /^transport-(seg-\d+)-long_distance$/;

/** 从 issueId / blockerId 解析 segmentId，如 `issue-transport-seg-8-long_distance` → `seg-8` */
export function parseRoadClassSegmentIdFromRef(ref: string): string | undefined {
  const blockerId = ref.startsWith('issue-') ? resolveIssueIdToBlockerId(ref) : ref;
  const match = blockerId.match(ROAD_CLASS_BLOCKER_RE);
  return match?.[1];
}

export function isRoadClassIssueRef(
  ref: string,
  issue?: { issueKind?: string },
): boolean {
  if (issue?.issueKind === 'road_class') return true;
  return parseRoadClassSegmentIdFromRef(ref) != null;
}

export function roadClassBlockerIdForSegment(segmentId: string): string {
  return `transport-${segmentId}-long_distance`;
}

/** coverage 合成 finding — findings 列表缺失时 repair-options 仍可返回 Plan B */
export function synthesizeRoadClassFindingFromCoverage(
  segmentId: string,
  coverage: CoverageMapData,
): ReadinessScoreFinding | undefined {
  const segment = coverage.segments.find((s) => s.id === segmentId);
  if (!segment) return undefined;

  const fromPoi = coverage.pois.find((p) => p.id === segment.fromPoiId);
  const toPoi = coverage.pois.find((p) => p.id === segment.toPoiId);
  if (!fromPoi || !toPoi) return undefined;

  const thresholds = coverage.segmentDistanceThresholds ?? GLOBAL_SEGMENT_DISTANCE_THRESHOLDS;
  const longHazard = segment.hazards.find((h) => h.type === 'long_distance');
  const qualifies =
    Boolean(longHazard) ||
    segment.distance > thresholds.maxSegmentDistanceKm ||
    segment.distance > thresholds.warnSegmentDistanceKm;
  if (!qualifies) return undefined;

  const hazardMessage =
    longHazard?.message ??
    (segment.distance > thresholds.maxSegmentDistanceKm
      ? longDistanceHighMessage(thresholds.maxSegmentDistanceKm)
      : longDistanceWarnMessage(thresholds.warnSegmentDistanceKm));
  const severity =
    longHazard?.severity === 'high' || segment.distance > thresholds.maxSegmentDistanceKm
      ? 'high'
      : 'medium';
  const highlightIds = [fromPoi.itemId, toPoi.itemId].filter(Boolean) as string[];

  return {
    id: roadClassBlockerIdForSegment(segment.id),
    type: severity === 'high' ? 'must' : 'should',
    category: 'transport',
    message: `第${segment.day}天 · ${fromPoi.name} → ${toPoi.name} · ${hazardMessage}`,
    severity,
    affectedDays: [segment.day],
    issueKind: 'road_class',
    fromItemId: fromPoi.itemId,
    toItemId: toPoi.itemId,
    anchors: {
      segmentId: segment.id,
      fromPoiId: fromPoi.id,
      toPoiId: toPoi.id,
      fromItemId: fromPoi.itemId,
      toItemId: toPoi.itemId,
      fromPlaceLabel: fromPoi.name,
      toPlaceLabel: toPoi.name,
      distanceKm: segment.distance,
      durationMinutes: segment.duration,
      hazardType: 'long_distance',
    },
    uiHints: {
      primaryAction: 'open_repair',
      deepLink: {
        tab: 'schedule',
        dayIndex: Math.max(0, segment.day - 1),
        highlightItemIds: highlightIds,
      },
    },
    tripScope: {
      kind: 'segment',
      day: segment.day,
      segmentId: segment.id,
      fromPoi: { id: fromPoi.id, name: fromPoi.name },
      toPoi: { id: toPoi.id, name: toPoi.name },
      distanceKm: segment.distance,
    },
  };
}

export function synthesizeRoadClassIssueFromCoverage(
  issueRef: string,
  coverage: CoverageMapData,
): FeasibilityIssueDto | undefined {
  const segmentId = parseRoadClassSegmentIdFromRef(issueRef);
  if (!segmentId) return undefined;

  const finding = synthesizeRoadClassFindingFromCoverage(segmentId, coverage);
  if (!finding) return undefined;

  const canonicalId = issueRef.startsWith('issue-')
    ? issueRef
    : normalizeIssueId(finding.id);

  return {
    id: canonicalId,
    priority: finding.type === 'blocker' ? 'must_handle' : 'suggest_adjust',
    category: 'transport',
    title: finding.message.split('·').pop()?.trim()?.slice(0, 80) ?? finding.message.slice(0, 80),
    message: finding.message,
    affectedDays: finding.affectedDays ?? [],
    severity: finding.severity,
    issueKind: 'road_class',
    fromItemId: finding.fromItemId,
    toItemId: finding.toItemId,
    anchors: finding.anchors as FeasibilityIssueDto['anchors'],
    uiHints: finding.uiHints as FeasibilityIssueDto['uiHints'],
  };
}

/** 在 readiness findings 中解析 road_class blocker（含 coverage 回退合成） */
export function resolveRoadClassFindingForRepair(
  blockerId: string,
  findings: ReadinessScoreFinding[],
  coverage: CoverageMapData,
): ReadinessScoreFinding | undefined {
  const direct = findings.find((f) => f.id === blockerId);
  if (direct) return direct;

  const segmentId = parseRoadClassSegmentIdFromRef(blockerId);
  if (!segmentId) return undefined;

  const byTransportId = findings.find((f) => f.id === roadClassBlockerIdForSegment(segmentId));
  if (byTransportId) return byTransportId;

  const byKind = findings.find(
    (f) =>
      f.issueKind === 'road_class' &&
      (f.anchors as Record<string, unknown> | undefined)?.segmentId === segmentId,
  );
  if (byKind) return byKind;

  return synthesizeRoadClassFindingFromCoverage(segmentId, coverage);
}

/** ≥300km 超长路段 — 结构性 Plan B（非 adjust_time 为主） */
export function buildRoadClassRepairOptions(
  tripId: string,
  issue: FeasibilityIssueDto,
): RepairOptionsResponse {
  const anchors = (issue.anchors ?? {}) as Record<string, unknown>;
  const fromLabel = String(anchors.fromPlaceLabel ?? '起点');
  const toLabel = String(anchors.toPlaceLabel ?? '终点');
  const distanceKm = typeof anchors.distanceKm === 'number' ? anchors.distanceKm : undefined;
  const segmentId = typeof anchors.segmentId === 'string' ? anchors.segmentId : undefined;
  const toItemId = issue.toItemId ?? (typeof anchors.toItemId === 'string' ? anchors.toItemId : undefined);
  const fromItemId = issue.fromItemId ?? (typeof anchors.fromItemId === 'string' ? anchors.fromItemId : undefined);
  const affectedDays = issue.affectedDays ?? [];
  const baseDay = affectedDays.length ? Math.max(...affectedDays) : 1;
  const nextDayNumber = baseDay + 1;
  const distanceHint = distanceKm != null ? `（约 ${distanceKm} km）` : '';

  const sharedMeta = {
    tripId,
    issueKind: 'road_class' as const,
    primaryAction: 'open_repair',
    deepLink: issue.uiHints?.deepLink,
  };

  const options: RepairOptionsResponse['options'] = [
    {
      id: 'insert_midpoint_stay',
      title: '中途住宿拆段',
      description: `${fromLabel} → ${toLabel}${distanceHint}：在中间城镇过夜，次日再前往目的地。`,
      impact: 'high',
      timeEstimate: '5分钟',
      actionType: 'change_hotel',
      payload: {
        strategy: 'midpoint_overnight',
        segmentId,
        fromItemId,
        toItemId,
        suggestedMidpointHint: anchors.suggestedMidpointHint,
        validateScope: segmentId ? { type: 'route', segmentId } : { type: 'issue', issueId: issue.id },
        anchors,
      },
      metadata: sharedMeta,
    },
    {
      id: 'move_destination_day',
      title: '目的地挪到次日',
      description: `将 ${toLabel} 移至 Day ${nextDayNumber}，Day ${baseDay} 仅保留 ${fromLabel} 出发段驾驶。`,
      impact: 'high',
      timeEstimate: '3分钟',
      actionType: 'move_to_day',
      payload: {
        suggestedValue: { dayNumber: nextDayNumber },
        itemId: toItemId,
        segmentId,
        validateScope: { type: 'issue', issueId: issue.id },
        anchors,
      },
      metadata: sharedMeta,
    },
    {
      id: 'alternative_route',
      title: '换近路线',
      description: `为 ${fromLabel} → ${toLabel} 寻找更短或更安全的替代路线。`,
      impact: 'medium',
      timeEstimate: '8分钟',
      actionType: 'find_alternative_route',
      payload: {
        segmentId,
        fromItemId,
        toItemId,
        validateScope: segmentId ? { type: 'route', segmentId } : { type: 'issue', issueId: issue.id },
        anchors,
      },
      metadata: sharedMeta,
    },
    {
      id: 'reorder_split',
      title: '调整相邻日安排',
      description: `重新排列 ${fromLabel} 与 ${toLabel} 所在日行程，避免单日超长驾驶。`,
      impact: 'medium',
      timeEstimate: '10分钟',
      actionType: 'reorder_pois',
      payload: {
        segmentId,
        affectedDays,
        fromItemId,
        toItemId,
        validateScope: { type: 'issue', issueId: issue.id },
        anchors,
      },
      metadata: sharedMeta,
    },
  ];

  return {
    issueId: issue.id,
    blockerId: resolveIssueIdToBlockerId(issue.id),
    blockerMessage: issue.message,
    options,
    cascadeUiHints: [
      {
        id: `${issue.id}:road-class`,
        riskLevel: issue.severity === 'high' ? 'HIGH' : 'MEDIUM',
        message: issue.message,
        recommendation: '建议中途住宿或拆成两日驾驶，避免单次超长路段',
      },
    ],
  };
}

/** 超长单段路段 hazard（阈值来自 coverage 或全局默认） */
export function isRoadClassHazard(
  hazard: { type: string; severity: string },
  segmentDistanceKm: number,
  maxSegmentDistanceKm: number = GLOBAL_SEGMENT_DISTANCE_THRESHOLDS.maxSegmentDistanceKm,
): boolean {
  return (
    hazard.type === 'long_distance' &&
    hazard.severity === 'high' &&
    segmentDistanceKm > maxSegmentDistanceKm
  );
}

const ROAD_CLASS_STRUCTURAL_ACTIONS = new Set([
  'move_to_day',
  'change_hotel',
  'reorder_pois',
  'find_alternative_route',
]);

/** road_class Plan B — 走 payload 结构性模拟，不经 Neptune dry-run */
export function isRoadClassStructuralRepairOption(option: {
  actionType?: string;
  metadata?: Record<string, unknown>;
  payload?: Record<string, unknown>;
}): boolean {
  if (!option.actionType || !ROAD_CLASS_STRUCTURAL_ACTIONS.has(option.actionType)) {
    return false;
  }
  if (option.metadata?.issueKind === 'road_class') return true;
  if (option.payload?.segmentId) return true;
  if (option.payload?.strategy === 'midpoint_overnight') return true;
  return false;
}
