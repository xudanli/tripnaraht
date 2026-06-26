import { DateTime } from 'luxon';
import type { ConflictDto } from '../../dto/trip-conflicts.dto';
import { ConflictSeverity, ConflictType } from '../../dto/trip-conflicts.dto';
import type {
  CoverageGap,
  CoverageMapData,
  EvidenceType,
  PoiCoverage,
  ReadinessScoreFinding,
  ReadinessScoreResponse,
} from '../../readiness/types/coverage-map.types';
import type {
  FeasibilityAlternativeDto,
  FeasibilityDayStatus,
  FeasibilityDayTimelineDto,
  FeasibilityDimensionDto,
  FeasibilityDimensionKey,
  FeasibilityIssueDto,
  FeasibilityIssuePriority,
  FeasibilityProofDto,
  FeasibilityProbabilisticAssessmentDto,
  FeasibilitySummaryDto,
  FeasibilityVerdictDto,
  FeasibilityVerdictStatus,
  TeamFitSummaryDto,
  ItineraryCompletenessSummaryDto,
  TripFeasibilityReportDto,
} from '../types/trip-constraint-solver.types';
import { normalizeIssueId, revisionToString, type TripRevisionInfo } from './trip-revision.util';
import {
  buildFeasibilityVerdictSubheadline,
  dedupeFeasibilityIssues,
} from './feasibility-issue-dedup.util';

const DIMENSION_LABELS: Record<FeasibilityDimensionKey, string> = {
  schedule: '日程可行性',
  transport: '道路与交通',
  booking: '开放与预订',
  environment: '天气与环境',
  team_fit: '团队成员适配',
  itinerary_completeness: '行程结构完整',
};

export interface FeasibilityDecisionEvidenceInput {
  id: string;
  timestamp: Date | string;
  persona?: string | null;
  decisionStage?: string | null;
  reasonCodes?: string[];
  evidence: Record<string, unknown>;
  explanation?: string | null;
}

interface EvidenceContext {
  coverage?: CoverageMapData;
  decisionEvidence?: FeasibilityDecisionEvidenceInput[];
}

function mapFindingCategory(category: string): FeasibilityDimensionKey {
  const c = category.toLowerCase();
  if (c.includes('transport') || c.includes('road') || c.includes('vehicle')) return 'transport';
  if (c.includes('evidence') || c.includes('opening') || c.includes('booking')) return 'booking';
  if (c.includes('weather') || c.includes('safety') || c.includes('environment')) return 'environment';
  if (c.includes('team') || c.includes('member') || c.includes('friction')) return 'team_fit';
  if (c.includes('itinerary') || c.includes('completeness') || c.includes('meal') || c.includes('duplicate')) {
    return 'itinerary_completeness';
  }
  if (c.includes('schedule') || c.includes('time') || c.includes('buffer')) return 'schedule';
  return 'schedule';
}

function mapConflictCategory(type: ConflictType): FeasibilityDimensionKey {
  switch (type) {
    case ConflictType.TRANSPORT_TOO_LONG:
    case ConflictType.TRANSPORT_INSUFFICIENT:
      return 'transport';
    case ConflictType.CLOSURE_RISK:
      return 'booking';
    case ConflictType.FATIGUE_EXCEEDED:
    case ConflictType.ACCESSIBILITY_MISMATCH:
      return 'environment';
    default:
      return 'schedule';
  }
}

/**
 * Readiness finding → issue priority.
 * 仅 `type: blocker` 升格 must_handle；severity  alone 不升格（避免「过满/长途」等 heuristic 误杀 EXECUTABLE）。
 * 判定表见 TRIP_CONSTRAINT_SOLVER_API.md § must_handle 判定。
 */
export function mapReadinessFindingPriority(f: ReadinessScoreFinding): FeasibilityIssuePriority {
  if (f.type === 'blocker') return 'must_handle';
  if (f.type === 'must' || f.type === 'warning') return 'suggest_adjust';
  if (f.type === 'should' || f.type === 'suggestion') return 'pending_confirm';
  return 'pending_confirm';
}

function findingPriority(f: ReadinessScoreFinding): FeasibilityIssuePriority {
  return mapReadinessFindingPriority(f);
}

function conflictPriority(c: ConflictDto): FeasibilityIssuePriority {
  if (c.priority) return c.priority;
  if (c.severity === ConflictSeverity.HIGH) return 'must_handle';
  if (c.type === ConflictType.CLOSURE_RISK || c.type === ConflictType.TRANSPORT_INSUFFICIENT) {
    return 'must_handle';
  }
  if (c.severity === ConflictSeverity.MEDIUM) return 'suggest_adjust';
  return 'pending_confirm';
}

function parseAffectedDayNumbers(values: string[] | undefined): number[] {
  if (!values?.length) return [];
  return values
    .map((v) => {
      const m = String(v).match(/(\d+)/);
      return m ? Number(m[1]) : NaN;
    })
    .filter((n) => Number.isFinite(n) && n > 0);
}

function findingToIssue(f: ReadinessScoreFinding, evidenceContext?: EvidenceContext): FeasibilityIssueDto {
  const category = mapFindingCategory(f.category);
  const proofs: FeasibilityProofDto[] = buildProofsForFinding(f, category, evidenceContext);
  if (!proofs.length && f.id.startsWith('coverage-gap:')) {
    proofs.push({
      entity: f.tripScope?.fromPoi?.name ?? '行程项',
      constraint: f.actionRequired ?? '证据覆盖不足',
      currentFact: f.message,
      evidenceSource: 'readiness.coverage',
      evidenceType: 'coverage-gap',
      conclusion: f.type === 'blocker' ? '阻塞可执行性' : '待补充证据',
      confidence: f.severity === 'high' ? 0.9 : 0.7,
    });
  }
  return {
    id: normalizeIssueId(f.id),
    priority: findingPriority(f),
    category,
    title: f.message.split('：')[0]?.slice(0, 80) || f.message.slice(0, 80),
    message: f.message,
    affectedDays: f.affectedDays ?? [],
    severity: f.severity,
    issueKind: f.issueKind,
    fromItemId: f.fromItemId,
    toItemId: f.toItemId,
    anchors: f.anchors as FeasibilityIssueDto['anchors'],
    uiHints: f.uiHints as FeasibilityIssueDto['uiHints'],
    actionRequired: f.actionRequired,
    proofs: proofs.length ? proofs : undefined,
  };
}

function buildProofsForFinding(
  f: ReadinessScoreFinding,
  category: FeasibilityDimensionKey,
  evidenceContext?: EvidenceContext,
): FeasibilityProofDto[] {
  const proofs: FeasibilityProofDto[] = [];
  const coverage = evidenceContext?.coverage;
  if (!coverage) return proofs;

  const gap = findCoverageGapForFinding(f, coverage);
  const relatedPois = findRelatedPoisForFinding(f, gap, coverage);
  if (gap) {
    proofs.push(...coverageGapStatusProofs(gap, coverage, relatedPois));
  } else {
    for (const poi of relatedPois.slice(0, 2)) {
      proofs.push(...poiEvidenceProofs(poi, category).slice(0, 2));
    }
  }

  if (!proofs.length && coverage.evidenceStatusSummary) {
    const fetched = coverage.evidenceStatusSummary.fetched;
    const total = coverage.evidenceStatusSummary.total;
    proofs.push({
      entity: '全行程证据覆盖',
      constraint: 'evidence_coverage',
      currentFact: `已获取 ${fetched}/${total} 项证据；覆盖率 ${Math.round((coverage.summary.coverageRate ?? 0) * 100)}%`,
      evidenceSource: 'readiness.coverage-map',
      observedAt: coverage.calculatedAt,
      evidenceType: 'coverage-summary',
      conclusion: coverage.evidenceStatusSummary.missing > 0 ? '仍有证据待补齐' : '证据已覆盖',
      confidence: 0.75,
    });
  }

  proofs.push(...decisionEvidenceProofsForFinding(f, evidenceContext?.decisionEvidence).slice(0, 1));
  return dedupeProofs(proofs).slice(0, 4);
}

function findCoverageGapForFinding(f: ReadinessScoreFinding, coverage: CoverageMapData): CoverageGap | undefined {
  if (!f.id.startsWith('coverage-gap:')) return undefined;
  const gapId = f.id.slice('coverage-gap:'.length);
  return coverage.gaps.find((gap) => gap.id === gapId);
}

function findRelatedPoisForFinding(
  f: ReadinessScoreFinding,
  gap: CoverageGap | undefined,
  coverage: CoverageMapData,
): PoiCoverage[] {
  const byId = new Set<string>();
  if (gap?.type === 'poi') byId.add(gap.relatedId);
  for (const id of gap?.affectedPois ?? []) byId.add(id);
  if (f.tripScope?.fromPoi?.id) byId.add(f.tripScope.fromPoi.id);
  if (f.tripScope?.toPoi?.id) byId.add(f.tripScope.toPoi.id);

  const scopedNames = [
    f.tripScope?.fromPoi?.name,
    f.tripScope?.toPoi?.name,
  ].filter(Boolean) as string[];

  const affectedDays = new Set(f.affectedDays ?? gap?.affectedDays ?? []);
  const strictOut = coverage.pois.filter((poi) => {
    if (byId.has(poi.id)) return true;
    return scopedNames.some((name) => poi.name.includes(name) || name.includes(poi.name));
  });
  if (strictOut.length) return strictOut;

  const out = coverage.pois.filter((poi) => affectedDays.has(poi.day));
  return out.length ? out : coverage.pois.filter((poi) => poi.evidenceCount > 0).slice(0, 2);
}

function coverageGapStatusProofs(
  gap: CoverageGap,
  coverage: CoverageMapData,
  relatedPois: PoiCoverage[],
): FeasibilityProofDto[] {
  const sortedStatuses = [...(gap.evidenceStatus ?? [])].sort((a, b) => {
    const rank = (status: string) => (status === 'missing' || status === 'failed' ? 0 : status === 'fetching' ? 1 : 2);
    return rank(a.status) - rank(b.status);
  });
  const statusProofs = sortedStatuses.slice(0, 3).map((s) => {
    const poi = evidenceStatusPoi(s.type, relatedPois, gap);
    const repairOptions = buildProofRepairOptionsForEvidence(s.type, poi);
    return {
      itemId: poi?.itemId,
      placeLabel: poi?.name ?? evidenceStatusEntity(s.type, relatedPois, gap),
      entity: poi?.name ?? evidenceStatusEntity(s.type, relatedPois, gap),
      constraint: '证据覆盖检查',
      currentFact: evidenceStatusFact(s.type, s.status),
      evidenceSource: humanEvidenceSource(s.source ?? 'readiness.coverage-map'),
      observedAt: s.lastUpdated ?? coverage.calculatedAt,
      evidenceType: s.type,
      ruleId: proofRuleIdForEvidence(s.type),
      conclusion: s.status === 'fetched' ? '可作为判断依据' : '需要补充后再判断',
      confidence: s.status === 'fetched' ? 0.85 : 0.65,
      repairOptions,
      planBOptions: repairOptions,
    };
  });

  if (statusProofs.length) return statusProofs;

  return (gap.missingEvidence ?? []).map((type) => {
    const poi = evidenceStatusPoi(type, relatedPois, gap);
    const repairOptions = buildProofRepairOptionsForEvidence(type, poi);
    return {
      itemId: poi?.itemId,
      placeLabel: poi?.name ?? evidenceStatusEntity(type, relatedPois, gap),
      entity: poi?.name ?? evidenceStatusEntity(type, relatedPois, gap),
      constraint: '证据覆盖检查',
      currentFact: `${evidenceLabel(type)}证据未获取`,
      evidenceSource: '覆盖地图',
      observedAt: coverage.calculatedAt,
      evidenceType: type,
      ruleId: proofRuleIdForEvidence(type),
      conclusion: '需要补充后再判断',
      confidence: gap.severity === 'high' ? 0.85 : 0.7,
      repairOptions,
      planBOptions: repairOptions,
    };
  }).slice(0, 3);
}

function evidenceStatusPoi(
  type: EvidenceType | string,
  relatedPois: PoiCoverage[],
  gap: CoverageGap,
): PoiCoverage | undefined {
  return (
    relatedPois.find((poi) => poi.missingEvidence?.includes(type as EvidenceType)) ??
    relatedPois.find((poi) => poi.id === gap.relatedId) ??
    relatedPois[0]
  );
}

function evidenceStatusEntity(type: EvidenceType | string, relatedPois: PoiCoverage[], gap: CoverageGap): string {
  const missingPoi = relatedPois.find((poi) => poi.missingEvidence?.includes(type as EvidenceType));
  if (missingPoi) return missingPoi.name;
  if (gap.type === 'poi') {
    const poi = relatedPois.find((p) => p.id === gap.relatedId);
    if (poi) return poi.name;
  }
  return relatedPois[0]?.name ?? gap.relatedId;
}

function poiEvidenceProofs(poi: PoiCoverage, category: FeasibilityDimensionKey): FeasibilityProofDto[] {
  const freshness = poi.metadata ?? {};
  return (poi.evidenceTypes ?? []).map((type) => ({
    itemId: poi.itemId,
    placeLabel: poi.name,
    entity: poi.name,
    constraint: category === 'transport' ? '道路/交通可行性' : 'POI 可执行性证据',
    currentFact: `${poi.name} 已具备 ${evidenceLabel(type)} 证据`,
    evidenceSource: evidenceSourceFromType(type),
    observedAt: observedAtForEvidence(type, freshness),
    evidenceType: type,
    ruleId: proofRuleIdForEvidence(type),
    conclusion: poi.coverageStatus === 'covered' ? '证据覆盖充分' : '证据部分覆盖',
    confidence: poi.coverageStatus === 'covered' ? 0.85 : 0.7,
  }));
}

function decisionEvidenceProofsForFinding(
  f: ReadinessScoreFinding,
  evidenceRows?: FeasibilityDecisionEvidenceInput[],
): FeasibilityProofDto[] {
  if (!evidenceRows?.length) return [];
  return evidenceRows
    .filter((row) => {
      const ev = row.evidence;
      const reasonCodes = row.reasonCodes ?? [];
      const findingText = `${f.id} ${f.message} ${f.actionRequired ?? ''} ${row.explanation ?? ''}`;
      const type = String(ev.type ?? '');
      const poiId = String(ev.poi_id ?? ev.poiId ?? '');
      return (
        (type && findingText.includes(type)) ||
        (poiId && findingText.includes(poiId)) ||
        reasonCodes.some((r) => r && findingText.includes(r))
      );
    })
    .map((row) => {
      const ev = row.evidence;
      const type = String(ev.type ?? 'machine_evidence');
      return {
        entity: String(ev.poi_name ?? ev.poi_id ?? ev.item_id ?? '行程项'),
        constraint: row.reasonCodes?.join(', ') || type,
        currentFact: row.explanation ?? JSON.stringify(ev).slice(0, 160),
        evidenceSource: String(ev.source ?? 'decision-log'),
        observedAt: toIso(row.timestamp),
        evidenceType: type,
        conclusion: ev.is_violated === true ? '已触发可行性风险' : '机器证据已记录',
        confidence: 0.8,
      };
    });
}

function evidenceLabel(type: EvidenceType | string): string {
  switch (type) {
    case 'opening_hours':
      return '开放时间';
    case 'weather':
      return '天气';
    case 'road_closure':
      return '道路状态';
    case 'booking_confirmation':
      return '预订确认';
    case 'permit':
      return '许可';
    default:
      return String(type);
  }
}

function proofRuleIdForEvidence(type: EvidenceType | string): string | undefined {
  if (type === 'booking_confirmation') return 'booking.advance_reservation.poi';
  return undefined;
}

function buildProofRepairOptionsForEvidence(
  type: EvidenceType | string,
  poi?: PoiCoverage,
) {
  if (type !== 'booking_confirmation' || !poi?.itemId) return undefined;

  const options = [];
  const suggestedTime = suggestBookingFallbackTime(poi.startTime);
  if (suggestedTime) {
    options.push({
      id: `proof-planb-adjust-time-${poi.itemId}`,
      label: `调整${poi.name}时段`,
      description: '改到更容易预约或更可替代的时段，并重新验证预约与开放时间。',
      impactSummary: '缓解预约不可确认风险',
      type: 'adjust_time',
      actionType: 'adjust_time',
      payload: {
        itemId: poi.itemId,
        field: 'startTime',
        suggestedValue: suggestedTime,
        validateScope: { type: 'item', itemId: poi.itemId },
      },
    });
  }

  options.push({
    id: `proof-planb-replace-poi-${poi.itemId}`,
    label: `替换${poi.name}`,
    description: '换成同区域、同类型、无需提前预约或更容易确认的备选点。',
    impactSummary: '绕开预约确认缺口',
    type: 'replace_poi',
    actionType: 'replace_poi',
    payload: {
      itemId: poi.itemId,
      suggestedValue: {
        category: poi.type,
        placeLabel: poi.name,
        avoidRequiresReservation: true,
      },
      validateScope: { type: 'item', itemId: poi.itemId },
    },
  });

  return options.slice(0, 3);
}

function suggestBookingFallbackTime(startTime?: string): string | undefined {
  if (!startTime) return undefined;
  const dt = DateTime.fromISO(startTime);
  if (!dt.isValid) return undefined;
  return dt.plus({ hours: 2 }).toUTC().toISO() ?? undefined;
}

function evidenceStatusFact(type: EvidenceType | string, status: string): string {
  const label = evidenceLabel(type);
  switch (status) {
    case 'fetched':
      return `${label}证据已获取`;
    case 'fetching':
      return `${label}证据获取中`;
    case 'failed':
      return `${label}证据获取失败`;
    default:
      return `${label}证据未获取`;
  }
}

function humanEvidenceSource(source: string): string {
  if (source === 'readiness.coverage-map') return '覆盖地图';
  if (source === 'road.is') return 'Road.is 路况';
  if (source.includes('Place.metadata')) return '地点资料库';
  return source;
}

function evidenceSourceFromType(type: EvidenceType): string {
  switch (type) {
    case 'weather':
      return 'Place.metadata.weatherInfo';
    case 'road_closure':
      return 'Place.metadata.roadStatus';
    case 'opening_hours':
      return 'Place.metadata.openingHours';
    case 'booking_confirmation':
      return 'Place.metadata.bookingConfirmation';
    case 'permit':
      return 'Place.metadata.permit';
    default:
      return 'Place.metadata';
  }
}

function observedAtForEvidence(type: EvidenceType, metadata: Record<string, unknown>): string | undefined {
  const key =
    type === 'weather'
      ? 'weatherFetchedAt'
      : type === 'road_closure'
        ? 'roadStatusFetchedAt'
        : type === 'opening_hours'
          ? 'openingHoursUpdatedAt'
          : type === 'booking_confirmation'
            ? 'bookingConfirmationUpdatedAt'
            : undefined;
  const value = key ? metadata[key] : undefined;
  return typeof value === 'string' ? value : undefined;
}

function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : value;
}

function dedupeProofs(proofs: FeasibilityProofDto[]): FeasibilityProofDto[] {
  const seen = new Set<string>();
  const out: FeasibilityProofDto[] = [];
  for (const proof of proofs) {
    const key = `${proof.entity}:${proof.evidenceSource}:${proof.evidenceType}:${proof.currentFact}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(proof);
  }
  return out;
}

function isTravelTimingConflict(c: ConflictDto): boolean {
  return (
    c.issueKind === 'same_day_travel' ||
    c.issueKind === 'inter_day_travel' ||
    c.id.startsWith('same-day-travel-') ||
    c.id.startsWith('inter-day-travel-')
  );
}

function formatMinutesZh(minutes: number | undefined): string {
  if (minutes == null || !Number.isFinite(minutes)) return '待确认';
  const rounded = Math.max(0, Math.round(minutes));
  const hours = Math.floor(rounded / 60);
  const mins = rounded % 60;
  if (hours > 0 && mins > 0) return `${hours} 小时 ${mins} 分钟`;
  if (hours > 0) return `${hours} 小时`;
  return `${mins} 分钟`;
}

function formatClock(value: string | undefined): string {
  if (!value) return '待确认';
  const dt = DateTime.fromISO(value, { setZone: true });
  return dt.isValid ? dt.toFormat('HH:mm') : value;
}

function buildTravelTimingProofs(c: ConflictDto, issueId: string): FeasibilityProofDto[] {
  const fromLabel = c.fromPlaceLabel ?? '上一站';
  const toLabel = c.toPlaceLabel ?? '下一站';
  const fromDay = c.fromDayNumber ?? parseAffectedDayNumbers(c.affectedDays)[0];
  const entity = `${fromDay ? `第${fromDay}天 · ` : ''}${fromLabel} → ${toLabel}`;
  const fromItemId = c.fromItemId ?? c.affectedItemIds?.[0];
  const toItemId = c.toItemId ?? c.affectedItemIds?.[1];
  const travelMinutes = c.travelMinutes ?? c.travelTimeMinutes;
  const distanceMeters =
    c.travelDistanceMeters ?? (c.distanceKm != null ? Math.round(c.distanceKm * 1000) : undefined);
  const distanceKm = distanceMeters != null ? Math.round((distanceMeters / 1000) * 10) / 10 : c.distanceKm;
  const routeFact = [
    distanceKm != null ? `路程约 ${distanceKm} km` : undefined,
    `路上约需 ${formatMinutesZh(travelMinutes)}`,
    c.travelMode ? `方式 ${c.travelMode}` : undefined,
  ].filter(Boolean).join('；');

  const timingFact =
    c.timingSource === 'missing_times'
      ? `出发、结束或活动开始时间缺失，无法完成交通衔接验算`
      : `出发 ${formatClock(c.departAt ?? c.fromTime)}；路上约 ${formatMinutesZh(travelMinutes)}；约 ${formatClock(c.arriveAt)} 抵达；活动开始 ${formatClock(c.activityStartAt ?? c.toTime)}`;
  const timingConclusion =
    c.timingSource === 'missing_times'
      ? '缺少关键时刻，需要先确认时间锚点'
      : (c.shortfallMinutes ?? 0) > 0
        ? `按当前时刻表无法按时抵达，时间不足约 ${Math.round(c.shortfallMinutes ?? 0)} 分钟`
        : `可抵达但缓冲偏紧，抵达后约 ${Math.round(c.gapMinutes ?? 0)} 分钟开始活动`;

  const timingRepairOptions = buildTravelTimingRepairOptions(issueId, c)?.filter(
    (option) => option.actionType === 'adjust_time',
  );

  return [
    {
      itemId: fromItemId,
      fromItemId,
      toItemId,
      placeLabel: fromLabel,
      entity,
      constraint: '路段行驶时间须纳入当日或跨日日程，并与下一站开始时间对齐',
      currentFact: routeFact,
      evidenceSource: 'route-engine / travel-info',
      evidenceType: 'L3-PROOF',
      ruleId: 'schedule.travel_time.route',
      conclusion: `本段预估行驶 ${formatMinutesZh(travelMinutes)}`,
      confidence: 0.9,
    },
    {
      itemId: toItemId,
      fromItemId,
      toItemId,
      placeLabel: toLabel,
      entity,
      constraint: '抵达时刻须不晚于下一站活动开始时间（含合理缓冲）',
      currentFact: timingFact,
      evidenceSource: '行程时间轴 / constraint-solver',
      evidenceType: 'L3-PROOF',
      ruleId: 'schedule.travel_time.timing',
      conclusion: timingConclusion,
      confidence: c.timingSource === 'missing_times' ? 0.65 : 0.9,
      repairOptions: timingRepairOptions,
      planBOptions: timingRepairOptions,
    },
  ];
}

function buildTravelTimingRepairOptions(issueId: string, c: ConflictDto) {
  const toItemId = c.toItemId ?? c.affectedItemIds?.[1];
  const suggestedTime = c.suggestedTime;
  const toLabel = c.toPlaceLabel ?? '下一站';
  const options = [];
  if (toItemId && suggestedTime) {
    options.push({
      id: 'repair-delay-start',
      label: `将${toLabel}推迟到 ${formatClock(suggestedTime)}`,
      description: '顺延下一项开始时间，消除交通时间不足。',
      impactSummary: '消除交通时间不足',
      type: 'adjust_time',
      actionType: 'adjust_time',
      payload: {
        itemId: toItemId,
        field: 'startTime',
        suggestedValue: suggestedTime,
        validateScope: { type: 'issue', issueId },
      },
    });
  }
  if (c.issueKind === 'inter_day_travel' && toItemId) {
    options.push({
      id: 'repair-move-to-day',
      label: '移动到更宽松的一天',
      description: '将下一站移动到更宽松的日期，避免跨天首段交通压缩出发窗口。',
      impactSummary: '释放跨天交通窗口',
      type: 'move_to_day',
      actionType: 'move_to_day',
      payload: {
        itemId: toItemId,
        suggestedValue: { dayNumber: (c.toDayNumber ?? Math.max(...parseAffectedDayNumbers(c.affectedDays), 1)) + 1 },
        validateScope: { type: 'issue', issueId },
      },
    });
  }
  return options.length ? options : undefined;
}

function conflictToIssue(c: ConflictDto, context?: { tripId: string }): FeasibilityIssueDto {
  const isTravelTiming = isTravelTimingConflict(c);
  const category = isTravelTiming ? 'schedule' : mapConflictCategory(c.type);
  const affectedDays = parseAffectedDayNumbers(c.affectedDays);
  const fromItemId = c.fromItemId ?? c.affectedItemIds?.[0];
  const toItemId = c.toItemId ?? c.affectedItemIds?.[1];
  const issueId = normalizeIssueId(`conflict-${c.id}`);
  const travelMinutes = c.travelMinutes ?? c.travelTimeMinutes;
  const travelDistanceMeters =
    c.travelDistanceMeters ?? (c.distanceKm != null ? Math.round(c.distanceKm * 1000) : undefined);
  const requiredMinutes =
    travelMinutes != null ? travelMinutes + 5 : undefined;
  const proofs: FeasibilityProofDto[] = isTravelTiming
    ? buildTravelTimingProofs(c, issueId)
    : [
        {
          entity: c.title,
          constraint: c.type,
          currentFact: c.description,
          evidenceSource: 'trip.conflicts',
          evidenceType: 'L3-PROOF',
          conclusion: c.severity === ConflictSeverity.HIGH ? '违反硬约束' : '存在潜在风险',
          confidence: c.severity === ConflictSeverity.HIGH ? 0.95 : 0.75,
        },
      ];
  return {
    id: issueId,
    priority: conflictPriority(c),
    category,
    title: c.title,
    message: c.description,
    affectedDays,
    severity: c.severity === ConflictSeverity.HIGH ? 'high' : c.severity === ConflictSeverity.MEDIUM ? 'medium' : 'low',
    issueKind: isTravelTiming ? c.issueKind : c.issueKind,
    fromItemId: isTravelTiming ? fromItemId : c.fromItemId,
    toItemId: isTravelTiming ? toItemId : c.toItemId,
    anchors: isTravelTiming
      ? {
          fromItemId,
          toItemId,
          fromDayNumber: c.fromDayNumber,
          toDayNumber: c.toDayNumber,
          fromPlaceLabel: c.fromPlaceLabel,
          toPlaceLabel: c.toPlaceLabel,
          travelMode: c.travelMode,
          travelMinutes,
          travelDistanceMeters,
          departAt: c.departAt ?? c.fromTime,
          arriveAt: c.arriveAt,
          activityStartAt: c.activityStartAt ?? c.toTime,
          fromTime: c.fromTime,
          toTime: c.toTime,
          gapMinutes: c.gapMinutes,
          travelTimeMinutes: travelMinutes,
          bufferMinutes: 5,
          requiredMinutes,
          shortfallMinutes: c.shortfallMinutes,
          suggestedTime: c.suggestedTime,
          isStartTooEarly: c.isStartTooEarly ?? (c.shortfallMinutes ?? 0) > 0,
          timingSource: c.timingSource,
        }
      : undefined,
    uiHints: isTravelTiming
      ? {
          primaryAction: 'adjust_time',
          deepLink: {
            tab: 'schedule',
            dayIndex: Math.max(0, (c.toDayNumber ?? affectedDays[0] ?? 1) - 1),
            highlightItemIds: [fromItemId, toItemId].filter(Boolean) as string[],
          },
          tripPath: `/trips/${context?.tripId ?? ''}?tab=schedule&itemId=${toItemId ?? ''}`,
        }
      : undefined,
    actionRequired: c.suggestions?.[0]?.description,
    repairOptions: isTravelTiming ? buildTravelTimingRepairOptions(issueId, c) : undefined,
    proofs,
  };
}

function buildDimensions(
  score: ReadinessScoreResponse['score'],
  issues: FeasibilityIssueDto[],
  teamFitScore?: number,
  itineraryCompletenessScore?: number,
): FeasibilityDimensionDto[] {
  const keys: FeasibilityDimensionKey[] = [
    'schedule',
    'transport',
    'booking',
    'environment',
    'team_fit',
    'itinerary_completeness',
  ];
  const scoreByKey: Record<FeasibilityDimensionKey, number> = {
    schedule: score.scheduleFeasibility ?? 0,
    transport: score.transportCertainty ?? 0,
    booking: score.evidenceCoverage ?? 0,
    environment: score.safetyRisk ?? 0,
    team_fit: teamFitScore ?? 100,
    itinerary_completeness: itineraryCompletenessScore ?? 100,
  };
  return keys.map((key) => {
    const dimIssues = issues.filter((i) => i.category === key);
    const blockers = dimIssues.filter((i) => i.priority === 'must_handle').length;
    const issueCount = dimIssues.length;
    let statusLabel = '正常';
    if (blockers > 0) statusLabel = `${blockers}项阻塞`;
    else if (issueCount > 0) statusLabel = `${issueCount}项待确认`;
    return {
      key,
      label: DIMENSION_LABELS[key],
      score: Math.round(Math.max(0, Math.min(100, scoreByKey[key]))),
      statusLabel,
      issueCount,
      blockerCount: blockers,
    };
  });
}

function buildDayTimeline(
  tripDays: Array<{ id: string; dayNumber: number }>,
  issues: FeasibilityIssueDto[],
): FeasibilityDayTimelineDto[] {
  return tripDays.map((day) => {
    const dayIssues = issues.filter((i) => i.affectedDays.includes(day.dayNumber));
    const issueIds = dayIssues.map((i) => i.id);
    let status: FeasibilityDayStatus = 'ok';
    if (dayIssues.some((i) => i.priority === 'must_handle')) status = 'blocked';
    else if (dayIssues.length > 0) status = 'warning';
    const summary =
      status === 'blocked'
        ? dayIssues.find((i) => i.priority === 'must_handle')?.title ?? null
        : status === 'warning'
          ? dayIssues[0]?.title ?? null
          : null;
    return {
      dayNumber: day.dayNumber,
      tripDayId: day.id,
      status,
      summary,
      issueIds,
    };
  });
}

function buildSummary(issues: FeasibilityIssueDto[]): FeasibilitySummaryDto {
  return {
    mustHandle: issues.filter((i) => i.priority === 'must_handle').length,
    suggestAdjust: issues.filter((i) => i.priority === 'suggest_adjust').length,
    pendingConfirm: issues.filter((i) => i.priority === 'pending_confirm').length,
    blockers: issues.filter((i) => i.priority === 'must_handle').length,
  };
}

export function resolveFeasibilityVerdict(input: {
  hasValidation: boolean;
  isStale: boolean;
  summary: FeasibilitySummaryDto;
  gateResult?: string;
  probabilisticAssessment?: FeasibilityProbabilisticAssessmentDto;
}): FeasibilityVerdictDto {
  const mcSuffix = buildMonteCarloSubheadline(input.probabilisticAssessment);

  if (!input.hasValidation) {
    return {
      status: 'UNKNOWN',
      headline: '尚未完成验证',
      subheadline: '点击「重新验证」生成可执行性报告',
    };
  }
  if (input.isStale) {
    return {
      status: 'STALE',
      headline: '报告已过期',
      subheadline: '行程已修改，请重新验证',
    };
  }
  const { mustHandle, suggestAdjust, pendingConfirm } = input.summary;
  if (input.gateResult === 'BLOCK' || mustHandle > 0) {
    return {
      status: 'NOT_EXECUTABLE',
      headline: '当前方案暂不可执行',
      subheadline: appendSubheadline(buildFeasibilityVerdictSubheadline(input.summary), mcSuffix),
    };
  }
  if (input.gateResult === 'ADJUST_REQUIRED' || suggestAdjust > 0 || pendingConfirm > 0) {
    return {
      status: 'ADJUST_REQUIRED',
      headline: '当前方案基本可行，需要调整',
      subheadline: appendSubheadline(buildFeasibilityVerdictSubheadline(input.summary), mcSuffix),
    };
  }
  return {
    status: 'EXECUTABLE',
    headline: '当前方案可执行',
    subheadline: appendSubheadline(buildFeasibilityVerdictSubheadline(input.summary), mcSuffix),
  };
}

function buildMonteCarloSubheadline(
  assessment?: FeasibilityProbabilisticAssessmentDto,
): string | undefined {
  if (!assessment || assessment.method !== 'MONTE_CARLO') return undefined;
  if (typeof assessment.feasibilityProbability !== 'number') return undefined;
  const pct = Math.round(assessment.feasibilityProbability * 100);
  const eu =
    typeof assessment.expectedUtility === 'number'
      ? `，E[U]=${assessment.expectedUtility.toFixed(2)}`
      : '';
  return `蒙特卡洛可执行概率 ${pct}%${eu}`;
}

function appendSubheadline(base: string, extra?: string): string {
  if (!extra) return base;
  return `${base} · ${extra}`;
}

export function buildAlternatives(
  overallScore: number,
  metadata: unknown,
): FeasibilityAlternativeDto[] {
  const meta = (metadata ?? {}) as Record<string, unknown>;
  const variants = Array.isArray(meta.planVariants) ? meta.planVariants : [];
  const alts: FeasibilityAlternativeDto[] = [
    {
      id: 'current',
      name: '当前方案',
      score: overallScore / 100,
      executabilityRate: overallScore,
      isCurrent: true,
    },
  ];
  for (const v of variants.slice(0, 3)) {
    if (!v || typeof v !== 'object') continue;
    const row = v as Record<string, unknown>;
    alts.push({
      id: String(row.id ?? `variant-${alts.length}`),
      name: String(row.name ?? '备选方案'),
      score: typeof row.score === 'number' ? row.score : 0.5,
      executabilityRate: typeof row.executabilityRate === 'number' ? row.executabilityRate : 80,
      drivingHours: typeof row.drivingHours === 'number' ? row.drivingHours : undefined,
      href: typeof row.href === 'string' ? row.href : undefined,
    });
  }
  return alts;
}

export function assembleFeasibilityReport(input: {
  trip: {
    id: string;
    name: string | null;
    startDate: Date;
    endDate: Date;
    metadata: unknown;
  };
  tripDays: Array<{ id: string; dayNumber: number }>;
  readiness: ReadinessScoreResponse;
  coverage?: CoverageMapData;
  decisionEvidence?: FeasibilityDecisionEvidenceInput[];
  conflicts: ConflictDto[];
  revision: TripRevisionInfo;
  snapshot?: { verifiedAt?: string; verifiedForTripVersion?: string; gateResult?: string } | null;
  locale?: string;
  probabilisticAssessment?: FeasibilityProbabilisticAssessmentDto;
  teamFitScore?: number;
  teamFitIssues?: FeasibilityIssueDto[];
  teamFitSummary?: TeamFitSummaryDto;
  itineraryCompletenessScore?: number;
  itineraryCompletenessIssues?: FeasibilityIssueDto[];
  itineraryCompletenessSummary?: ItineraryCompletenessSummaryDto;
}): TripFeasibilityReportDto {
  const evidenceContext = {
    coverage: input.coverage,
    decisionEvidence: input.decisionEvidence,
  };
  const findingIssues = input.readiness.findings.map((finding) => findingToIssue(finding, evidenceContext));
  const conflictIssues = input.conflicts.map((conflict) => conflictToIssue(conflict, { tripId: input.trip.id }));
  const teamFitIssues = input.teamFitIssues ?? [];
  const itineraryIssues = input.itineraryCompletenessIssues ?? [];
  const issues = dedupeFeasibilityIssues([
    ...findingIssues,
    ...conflictIssues,
    ...teamFitIssues,
    ...itineraryIssues,
  ]);
  const summary = buildSummary(issues);
  const verifiedFor = input.snapshot?.verifiedForTripVersion;
  const currentVersion = revisionToString(input.revision);
  const isStale = Boolean(verifiedFor && verifiedFor !== currentVersion);
  const hasValidation = Boolean(input.snapshot?.verifiedAt);
  const verdict = resolveFeasibilityVerdict({
    hasValidation,
    isStale,
    summary,
    gateResult: input.snapshot?.gateResult,
    probabilisticAssessment: input.probabilisticAssessment,
  });
  const overallScore = Math.round(input.readiness.score.overall ?? 0);
  const start = DateTime.fromJSDate(input.trip.startDate);
  const end = DateTime.fromJSDate(input.trip.endDate);
  const dateRangeLabel =
    input.locale === 'en'
      ? `${start.toFormat('MMM d')} – ${end.toFormat('MMM d')}`
      : `${start.toFormat('M月d日')}—${end.toFormat('M月d日')}`;

  return {
    tripId: input.trip.id,
    tripTitle: input.trip.name ?? '未命名行程',
    dateRangeLabel,
    verdict,
    overallScore,
    verifiedAt: input.snapshot?.verifiedAt,
    verifiedForTripVersion: verifiedFor,
    currentTripVersion: currentVersion,
    isStale,
    canStartExecute: computeCanStartExecute({
      hasValidation,
      isStale,
      verdictStatus: verdict.status,
      mustHandle: summary.mustHandle,
    }),
    phaseHint: input.readiness.phaseHint,
    coverageDisclosure: input.readiness.coverageDisclosure,
    dimensions: buildDimensions(
      input.readiness.score,
      issues,
      input.teamFitScore,
      input.itineraryCompletenessScore,
    ),
    dayTimeline: buildDayTimeline(input.tripDays, issues),
    issues,
    alternatives: buildAlternatives(overallScore, input.trip.metadata),
    summary,
    probabilisticAssessment: input.probabilisticAssessment,
    teamFitSummary: input.teamFitSummary,
    itineraryCompletenessSummary: input.itineraryCompletenessSummary,
  };
}

export function computeCanStartExecute(input: {
  hasValidation: boolean;
  isStale: boolean;
  verdictStatus: FeasibilityVerdictStatus;
  mustHandle: number;
}): boolean {
  return (
    input.hasValidation &&
    !input.isStale &&
    input.verdictStatus === 'EXECUTABLE' &&
    input.mustHandle === 0
  );
}

export function verdictStatusFromReport(report: TripFeasibilityReportDto): FeasibilityVerdictStatus {
  return report.verdict.status;
}
