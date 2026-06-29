import { DateTime } from 'luxon';
import type {
  JourneyMapDiversionDto,
  JourneyMapInspectorActivityContext,
  JourneyMapInspectorActivityDetailDto,
  JourneyMapInspectorActivitySourceDto,
  JourneyMapInspectorDiversionDetailDto,
  JourneyMapInspectorDiversionGroupDetailDto,
  JourneyMapInspectorEvidenceConclusionDto,
  JourneyMapInspectorEvidenceSourceDto,
  JourneyMapInspectorFitAssessmentDto,
  JourneyMapInspectorMemberRowDto,
  JourneyMapInspectorRiskViewDto,
  JourneyMapInspectorRouteEvidenceDto,
  JourneyMapInspectorWeatherSnapshotDto,
  JourneyMapMemberDto,
  JourneyMapEvidenceVerdict,
} from '../dto/journey-map.dto';
import type {
  CoverageMapData,
  PoiCoverage,
  ReadinessScoreFinding,
  ReadinessScoreRisk,
  SegmentCoverage,
} from '../readiness/types/coverage-map.types';
import type {
  DecisionCheckerEvidenceDto,
  DecisionCheckerImpactDto,
  DecisionCheckerResponse,
  DecisionCheckerSplitPlanDto,
} from '../trip-constraint-solver/types/decision-checker.types';
import type { PlanningDaySplitDto } from '../trip-constraint-solver/types/planning-conflicts.types';

const ACTIVITY_ITEM_TYPES = new Set(['ACTIVITY', 'REST', 'MEAL_ANCHOR', 'MEAL_FLOATING']);
const HIGH_TRAVEL_MINUTES = 90;

const EVIDENCE_SOURCE_CATALOG: Array<{
  id: string;
  label: string;
  freshnessKey: keyof NonNullable<CoverageMapData['dataFreshness']>;
}> = [
  { id: 'weather', label: 'Vedur.is', freshnessKey: 'weather' },
  { id: 'road', label: 'Road.is', freshnessKey: 'roadClosure' },
  { id: 'hours', label: 'Maps / 开放时间', freshnessKey: 'openingHours' },
  { id: 'inventory', label: '运营商 / 库存', freshnessKey: 'inventory' },
];

const GROUP_TAG: Record<string, string> = {
  young: '强体力',
  elderly: '需关注体力',
  children: '儿童',
};

const INTENSITY_SCORE: Record<string, number> = { high: 4, medium: 3, low: 2 };

export interface BuildJourneyMapInspectorContextsInput {
  itineraryItems: Record<string, unknown>[];
  members: JourneyMapMemberDto[];
  coverage: CoverageMapData;
  diversions: JourneyMapDiversionDto[];
  daySplits?: PlanningDaySplitDto[];
  decisionChecker?: DecisionCheckerResponse | null;
  scoreRisks: ReadinessScoreRisk[];
  scoreFindings: ReadinessScoreFinding[];
  ownerId?: string;
}

function canonicalItemId(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return trimmed;
  return trimmed.startsWith('item-') ? trimmed : `item-${trimmed}`;
}

function normalizeActivityId(raw: string): string {
  if (raw.startsWith('item-')) return raw.slice(5);
  return raw;
}

function resolveItemId(item: Record<string, unknown>): string | undefined {
  return typeof item.id === 'string' ? item.id : undefined;
}

function readPlace(item: Record<string, unknown>) {
  return item.Place as
    | {
        nameCN?: string | null;
        nameEN?: string | null;
        category?: string | null;
        metadata?: Record<string, unknown> | null;
      }
    | undefined;
}

function inferIntensity(item: Record<string, unknown>): 'high' | 'medium' | 'low' {
  const type = String(item.type ?? '').toUpperCase();
  if (type === 'REST' || type === 'MEAL_ANCHOR' || type === 'MEAL_FLOATING') return 'low';

  const travelMin = Number(item.travelFromPreviousDuration ?? 0);
  if (travelMin >= HIGH_TRAVEL_MINUTES) return 'high';
  if (travelMin >= 45) return 'medium';

  const place = readPlace(item);
  const category = place?.category?.toLowerCase() ?? '';
  const canonical = String(place?.metadata?.canonicalType ?? '').toUpperCase();
  if (
    canonical.includes('GLACIER') ||
    canonical.includes('TRAIL') ||
    canonical.includes('HIK') ||
    category.includes('outdoor') ||
    category.includes('nature')
  ) {
    return 'high';
  }
  if (type === 'ACTIVITY') return 'medium';
  return 'low';
}

function isInspectorCandidate(item: Record<string, unknown>): boolean {
  const type = String(item.type ?? '').toUpperCase();
  if (!ACTIVITY_ITEM_TYPES.has(type)) return false;
  return inferIntensity(item) === 'high';
}

function parseDurationHours(item: Record<string, unknown>): number | undefined {
  const start = item.startTime ? DateTime.fromISO(String(item.startTime)) : null;
  const end = item.endTime ? DateTime.fromISO(String(item.endTime)) : null;
  if (start?.isValid && end?.isValid) {
    const hours = end.diff(start, 'hours').hours;
    if (hours > 0) return Math.round(hours * 10) / 10;
  }
  const note = String(item.note ?? '');
  const match = note.match(/(\d+(?:\.\d+)?)\s*h/i);
  if (match) return Number(match[1]);
  return undefined;
}

function formatTimeRange(segments: Array<{ startTime?: string; endTime?: string }>): string | undefined {
  if (segments.length === 0) return undefined;
  const start = segments[0]?.startTime;
  const end = segments[segments.length - 1]?.endTime ?? segments[segments.length - 1]?.startTime;
  if (start && end) return `${start} – ${end}`;
  if (start) return start;
  return undefined;
}

function findPoiForItem(pois: PoiCoverage[], itemId: string): PoiCoverage | undefined {
  return pois.find((poi) => poi.itemId === itemId || poi.itemId === normalizeActivityId(itemId));
}

function findSegmentToItem(
  segments: SegmentCoverage[],
  itemId: string,
  pois: PoiCoverage[],
): SegmentCoverage | undefined {
  const poi = findPoiForItem(pois, itemId);
  if (!poi) return undefined;
  return segments.find((segment) => segment.toPoiId === poi.id);
}

function findDaySplitForActivity(
  activityId: string,
  daySplits?: PlanningDaySplitDto[],
): PlanningDaySplitDto | undefined {
  if (!daySplits?.length) return undefined;
  const normalized = normalizeActivityId(activityId);
  return daySplits.find((daySplit) =>
    daySplit.branches.some((branch) =>
      branch.segments.some((segment) => normalizeActivityId(segment.id.replace(/^seg_/, '')) === normalized),
    ),
  );
}

function findDiversionForActivity(
  activityId: string,
  diversions: JourneyMapDiversionDto[],
): JourneyMapDiversionDto | undefined {
  const canonical = canonicalItemId(activityId);
  return diversions.find(
    (diversion) =>
      canonicalItemId(diversion.groupA.activityId) === canonical ||
      canonicalItemId(diversion.groupB.activityId) === canonical,
  );
}

function findSplitPlanGroup(
  branchId: string,
  splitPlan?: DecisionCheckerSplitPlanDto,
) {
  return splitPlan?.groups.find((group) => group.id === branchId);
}

export function selectInspectorActivityIds(input: BuildJourneyMapInspectorContextsInput): string[] {
  const ids = new Set<string>();

  for (const diversion of input.diversions) {
    ids.add(canonicalItemId(diversion.groupA.activityId));
    ids.add(canonicalItemId(diversion.groupB.activityId));
  }

  for (const poi of input.coverage.pois) {
    if (poi.itemId && poi.coverageStatus !== 'covered') {
      ids.add(poi.itemId);
    }
  }

  for (const gap of input.coverage.gaps ?? []) {
    if (gap.type === 'poi') {
      const poi = input.coverage.pois.find((entry) => entry.id === gap.relatedId);
      if (poi?.itemId) ids.add(poi.itemId);
    }
  }

  for (const finding of input.scoreFindings) {
    if (finding.fromItemId) ids.add(finding.fromItemId);
    if (finding.toItemId) ids.add(finding.toItemId);
  }

  for (const item of input.itineraryItems) {
    const itemId = resolveItemId(item);
    if (itemId && isInspectorCandidate(item)) ids.add(itemId);
  }

  return [...new Set([...ids].map(canonicalItemId))].filter(Boolean);
}

function buildActivityTypeLabel(item: Record<string, unknown>, intensity: 'high' | 'medium' | 'low'): string {
  const place = readPlace(item);
  const name = place?.nameCN ?? place?.nameEN ?? '活动';
  const category = place?.category?.toLowerCase() ?? '';
  const intensityLabel = intensity === 'high' ? '高强度' : intensity === 'medium' ? '中等强度' : '低强度';
  const domain =
    category.includes('hotel') || category.includes('restaurant')
      ? '室内'
      : category.includes('nature') || category.includes('outdoor')
        ? '户外'
        : '综合';
  return `${name} / ${intensityLabel} / ${domain}`;
}

function readEquipment(place?: ReturnType<typeof readPlace>): string[] {
  const raw = place?.metadata?.equipment ?? place?.metadata?.gear;
  if (Array.isArray(raw)) {
    return raw.map(String).filter(Boolean).slice(0, 8);
  }
  if (typeof raw === 'string' && raw.trim()) return [raw.trim()];
  if (inferIntensity({ Place: place } as Record<string, unknown>) === 'high') {
    return ['冰爪', '头盔'];
  }
  return [];
}

function buildActivityDetail(
  item: Record<string, unknown>,
  activityId: string,
  coverage: CoverageMapData,
  splitPlan?: DecisionCheckerSplitPlanDto,
): JourneyMapInspectorActivityDetailDto {
  const place = readPlace(item);
  const intensity = inferIntensity(item);
  const poi = findPoiForItem(coverage.pois, activityId);
  const segment = findSegmentToItem(coverage.segments, activityId, coverage.pois);
  const weatherMeta = poi?.metadata?.weather as { summary?: string; tempRange?: string } | undefined;

  const transportMinutes =
    segment?.duration ?? Number(item.travelFromPreviousDuration ?? 0);

  return {
    activityId,
    activityTypeLabel: buildActivityTypeLabel(item, intensity),
    durationHours: parseDurationHours(item),
    transportMinutes: transportMinutes > 0 ? transportMinutes : undefined,
    equipment: readEquipment(place),
    weatherWindow:
      weatherMeta?.summary ??
      weatherMeta?.tempRange ??
      (coverage.dataFreshness?.weather ? '已同步天气预报，出发前请再次确认' : undefined),
    guideInfo:
      splitPlan?.logistics.guideBooking ??
      (typeof place?.metadata?.guideName === 'string' ? String(place.metadata.guideName) : undefined),
    intensityScore: INTENSITY_SCORE[intensity],
    summary:
      (typeof place?.metadata?.summary === 'string' && place.metadata.summary) ||
      (typeof place?.metadata?.description === 'string' && place.metadata.description) ||
      (place?.nameCN ?? place?.nameEN ?? undefined),
  };
}

function buildMemberRows(
  activityId: string,
  item: Record<string, unknown>,
  members: JourneyMapMemberDto[],
  ownerId: string | undefined,
  daySplit: PlanningDaySplitDto | undefined,
): JourneyMapInspectorMemberRowDto[] {
  const participantIds = new Set(
    (Array.isArray(item.participantIds) ? item.participantIds : []).map(String),
  );
  const normalized = normalizeActivityId(activityId);

  let alternativeByMember = new Map<string, string>();
  if (daySplit) {
    for (const branch of daySplit.branches) {
      const branchActivityIds = branch.segments.map((segment) =>
        normalizeActivityId(segment.id.replace(/^seg_/, '')),
      );
      const isCurrentBranch = branchActivityIds.includes(normalized);
      for (const member of branch.members ?? []) {
        if (isCurrentBranch) continue;
        if (branchActivityIds.length > 0) {
          alternativeByMember.set(member.id, branch.groupLabel || branch.segments[0]?.title || '替代方案');
        }
      }
    }
  }

  return members.map((member) => {
    const participating = participantIds.size === 0 ? true : participantIds.has(member.id);
    const roleLabel =
      member.id === ownerId ? '发起人' : participating ? '参与者' : '未参与';
    const tags = [GROUP_TAG[member.groupId]].filter(Boolean) as string[];

    return {
      memberId: member.id,
      participating,
      roleLabel,
      tags,
      alternativePlan: participating ? null : alternativeByMember.get(member.id) ?? '随主路线',
    };
  });
}

function buildFitAssessment(
  item: Record<string, unknown>,
  memberRows: JourneyMapInspectorMemberRowDto[],
  scoreRisks: ReadinessScoreRisk[],
): JourneyMapInspectorFitAssessmentDto {
  const intensity = inferIntensity(item);
  const participatingCount = memberRows.filter((row) => row.participating).length;
  const total = memberRows.length || 1;
  const ratio = participatingCount / total;
  const hasHighRisk = scoreRisks.some((risk) => risk.severity === 'high');

  let suitabilityPercent = Math.round(70 + ratio * 20 - (intensity === 'high' ? 10 : 0));
  suitabilityPercent = Math.max(40, Math.min(98, suitabilityPercent));

  const suitabilityLabel =
    suitabilityPercent >= 85 ? '非常适配' : suitabilityPercent >= 70 ? '基本适配' : '需谨慎';

  return {
    suitabilityPercent,
    suitabilityLabel,
    physicalRequirement: intensity === 'high' ? '高' : intensity === 'medium' ? '中' : '低',
    riskLevel: hasHighRisk || intensity === 'high' ? '中' : '低',
    weatherImpact: intensity === 'high' ? '中' : '低',
    suggestion:
      ratio < 1
        ? '部分成员未参与该活动，请确认分流方案与汇合安排。'
        : intensity === 'high'
          ? '多数成员体力匹配；出发前确认装备与天气窗口。'
          : '当前成员构成与该活动强度匹配。',
  };
}

function buildDiversionGroupDetail(
  branch: PlanningDaySplitDto['branches'][number],
  splitPlan?: DecisionCheckerSplitPlanDto,
): JourneyMapInspectorDiversionGroupDetailDto {
  const splitGroup = findSplitPlanGroup(branch.groupId, splitPlan);
  const segment = branch.segments[0];
  const intensity = segment?.intensity ?? splitGroup?.intensity ?? 'medium';
  const intensityLabel = intensity === 'high' ? '高强度' : intensity === 'medium' ? '中等强度' : '低强度';

  return {
    label: branch.groupLabel || splitGroup?.label || segment?.title || '分组',
    badge: splitGroup?.activityTitle ? '主活动组' : undefined,
    activityType: `${intensityLabel} · 户外`,
    timeRange: formatTimeRange(branch.segments),
    transport: splitPlan?.logistics.transport,
    route: segment?.placeName ?? segment?.title,
    estimatedCost: segment?.costPerPerson ?? splitGroup?.costPerPerson,
    riskLevel:
      segment?.riskLevel === 'high' ? '高' : segment?.riskLevel === 'medium' ? '中' : '低',
    participantCount: branch.memberCount,
  };
}

function buildDiversionDetail(
  activityId: string,
  daySplit: PlanningDaySplitDto,
  diversion: JourneyMapDiversionDto | undefined,
  splitPlan?: DecisionCheckerSplitPlanDto,
): JourneyMapInspectorDiversionDetailDto {
  const branchA = daySplit.branches[0];
  const branchB = daySplit.branches[1];
  const forkTime = daySplit.fork?.startTime;
  const lastEnd =
    branchA?.segments[branchA.segments.length - 1]?.endTime ??
    daySplit.rejoin?.startTime ??
    daySplit.stats?.meetupTime;

  return {
    activityId,
    overview: daySplit.title || diversion?.title || `Day ${daySplit.dayNumber} 分流`,
    splitTime: forkTime && lastEnd ? `${forkTime} – ${lastEnd}` : formatTimeRange(branchA?.segments ?? []),
    meetingPoint: splitPlan?.logistics.meetupPoint ?? diversion?.merge?.label,
    meetingTime: splitPlan?.logistics.meetupTime ?? daySplit.stats?.meetupTime ?? diversion?.merge?.time,
    emergencyContact: splitPlan?.logistics.emergencyContact,
    emergencyNote: splitPlan?.risks?.[0]?.description ?? splitPlan?.aiSuggestion?.text,
    groupA: branchA ? buildDiversionGroupDetail(branchA, splitPlan) : undefined,
    groupB: branchB ? buildDiversionGroupDetail(branchB, splitPlan) : undefined,
  };
}

function buildEvidenceSources(coverage: CoverageMapData): JourneyMapInspectorEvidenceSourceDto[] {
  const freshness = coverage.dataFreshness;
  return EVIDENCE_SOURCE_CATALOG.map((entry) => {
    const iso = freshness?.[entry.freshnessKey] ?? (entry.id === 'inventory' ? coverage.calculatedAt : undefined);
    return {
      id: entry.id,
      label: entry.label,
      updatedAt: iso,
      status: iso ? 'fresh' : 'stale',
    };
  });
}

function buildWeatherSnapshot(poi?: PoiCoverage): JourneyMapInspectorWeatherSnapshotDto | undefined {
  const weather = poi?.metadata?.weather as
    | { summary?: string; hourly?: JourneyMapInspectorWeatherSnapshotDto['hourly'] }
    | undefined;
  if (!weather?.summary && !weather?.hourly?.length) return undefined;
  return {
    summary: weather.summary,
    hourly: weather.hourly,
  };
}

function buildRouteEvidence(
  segment?: SegmentCoverage,
): JourneyMapInspectorRouteEvidenceDto | undefined {
  if (!segment) return undefined;
  const passability =
    segment.coverageStatus === 'blocked'
      ? '不可通行'
      : segment.coverageStatus === 'warning'
        ? '需谨慎'
        : '可通行';
  return {
    distanceKm: segment.distance,
    durationMinutes: segment.duration,
    passability,
    geometrySource: segment.geometrySource,
  };
}

function buildActivitySource(poi?: PoiCoverage): JourneyMapInspectorActivitySourceDto | undefined {
  if (!poi) return undefined;
  const hours = poi.metadata?.openingHours as { label?: string; status?: string } | undefined;
  return {
    operator: poi.name,
    status:
      poi.coverageStatus === 'covered'
        ? '已验证'
        : poi.coverageStatus === 'partial'
          ? '部分确认'
          : '待确认',
    hoursLabel: hours?.label ?? (poi.evidenceTypes?.includes('opening_hours') ? '营业时间已同步' : undefined),
  };
}

function resolveEvidenceVerdict(
  poi: PoiCoverage | undefined,
  findings: ReadinessScoreFinding[],
  activityId: string,
): JourneyMapInspectorEvidenceConclusionDto {
  const relatedFindings = findings.filter(
    (finding) => finding.fromItemId === activityId || finding.toItemId === activityId,
  );
  const hasBlocker = relatedFindings.some((finding) => finding.type === 'blocker');
  const hasMust = relatedFindings.some((finding) => finding.type === 'must' || finding.type === 'warning');

  let verdict: JourneyMapEvidenceVerdict = 'executable';
  if (hasBlocker || poi?.coverageStatus === 'uncovered') {
    verdict = 'blocked';
  } else if (hasMust || poi?.coverageStatus === 'partial') {
    verdict = 'caution';
  }

  const text =
    verdict === 'executable'
      ? '基于当前证据，满足执行条件；出发前建议再次确认天气与路况。'
      : verdict === 'caution'
        ? '证据部分缺失或存在必须项，建议补齐后再执行。'
        : '关键证据缺失，暂不建议按原计划执行。';

  return { verdict, text };
}

function buildRiskView(
  activityId: string,
  item: Record<string, unknown>,
  members: JourneyMapMemberDto[],
  memberRows: JourneyMapInspectorMemberRowDto[],
  coverage: CoverageMapData,
  scoreRisks: ReadinessScoreRisk[],
  scoreFindings: ReadinessScoreFinding[],
  impact?: DecisionCheckerImpactDto | null,
): JourneyMapInspectorRiskViewDto {
  const poi = findPoiForItem(coverage.pois, activityId);
  const day = poi?.day;
  const dayFindings = scoreFindings.filter(
    (finding) => !day || !finding.affectedDays?.length || finding.affectedDays.includes(day),
  );
  const dayRisks = scoreRisks.filter(
    (risk) => !poi?.id || !risk.affectedPois?.length || risk.affectedPois.includes(poi.id),
  );

  const severityRank = (value: string) => (value === 'high' ? 3 : value === 'medium' ? 2 : 1);
  const topSeverity = [...dayFindings, ...dayRisks].reduce<'high' | 'medium' | 'low'>(
    (acc, entry) => {
      const sev = entry.severity;
      return severityRank(sev) > severityRank(acc) ? sev : acc;
    },
    'low',
  );

  const keyRisks = [
    ...new Set([
      ...dayRisks.map((risk) => risk.message),
      ...dayFindings.filter((finding) => finding.severity !== 'low').map((finding) => finding.message),
    ]),
  ].slice(0, 6);

  const participating = memberRows.filter((row) => row.participating).length;
  const intensity = inferIntensity(item);

  return {
    level: topSeverity,
    levelLabel: topSeverity === 'high' ? '高风险' : topSeverity === 'medium' ? '中风险' : '低风险',
    score: intensity === 'high' ? 72 : 85,
    updatedAt: coverage.dataFreshness?.weather ?? coverage.calculatedAt,
    affectedCount: dayFindings.length + dayRisks.length,
    totalCount: members.length,
    keyRisks,
    majorRisks: dayRisks.slice(0, 3).map((risk) => ({
      description: risk.message,
      severity: risk.severity === 'high' ? '高' : risk.severity === 'medium' ? '中' : '低',
    })),
    impactScope: {
      hubs: `${dayFindings.length} 项`,
      members: `${participating} / ${members.length} 人`,
      time: impact?.summary.affectedDays?.value ?? (intensity === 'high' ? '+1~2 小时' : undefined),
      budget: impact?.summary.budgetImpact?.value,
    },
    mitigations: [
      ...dayRisks.flatMap((risk) => risk.mitigation ?? []),
      intensity === 'high' ? '装备检查：冰爪、头盔、防水外层' : undefined,
      '出发前 3 小时查看天气预报',
    ].filter(Boolean) as string[],
  };
}

function buildItemByIdMap(
  itineraryItems: Record<string, unknown>[],
): Map<string, Record<string, unknown>> {
  return new Map(
    itineraryItems
      .map((item) => {
        const id = resolveItemId(item);
        return id ? ([id, item] as const) : null;
      })
      .filter(Boolean) as Array<[string, Record<string, unknown>]>,
  );
}

function resolveItineraryItem(
  itemById: Map<string, Record<string, unknown>>,
  activityId: string,
): { canonicalId: string; item: Record<string, unknown> } | null {
  const canonicalId = canonicalItemId(activityId);
  const item =
    itemById.get(canonicalId) ??
    itemById.get(activityId) ??
    itemById.get(normalizeActivityId(activityId));
  if (!item) return null;
  return { canonicalId, item };
}

function buildSingleInspectorActivityContext(
  canonicalId: string,
  item: Record<string, unknown>,
  input: BuildJourneyMapInspectorContextsInput,
): JourneyMapInspectorActivityContext {
  const splitPlan = input.decisionChecker?.splitPlan;
  const evidence = input.decisionChecker?.evidence;
  const poi = findPoiForItem(input.coverage.pois, canonicalId);
  const segment = findSegmentToItem(input.coverage.segments, canonicalId, input.coverage.pois);
  const daySplit = findDaySplitForActivity(canonicalId, input.daySplits);
  const diversion = findDiversionForActivity(canonicalId, input.diversions);

  const memberRows = buildMemberRows(
    canonicalId,
    item,
    input.members,
    input.ownerId,
    daySplit,
  );
  const fitAssessment = buildFitAssessment(item, memberRows, input.scoreRisks);

  const context: JourneyMapInspectorActivityContext = {
    activityId: canonicalId,
    activityDetail: buildActivityDetail(item, canonicalId, input.coverage, splitPlan),
    memberRows,
    fitAssessment,
    evidenceSources: buildEvidenceSources(input.coverage),
    weatherSnapshot: buildWeatherSnapshot(poi),
    routeEvidence: buildRouteEvidence(segment),
    activitySource: buildActivitySource(poi),
    evidenceConclusion: resolveEvidenceVerdict(poi, input.scoreFindings, canonicalId),
    riskView: buildRiskView(
      canonicalId,
      item,
      input.members,
      memberRows,
      input.coverage,
      input.scoreRisks,
      input.scoreFindings,
      input.decisionChecker?.impact,
    ),
  };

  if (daySplit && diversion) {
    context.diversionDetail = buildDiversionDetail(canonicalId, daySplit, diversion, splitPlan);
  }

  if (evidence?.items.length) {
    context.evidenceSources = [
      ...(context.evidenceSources ?? []),
      ...evidence.items.slice(0, 4).map((entry) => ({
        id: entry.id,
        label: entry.publisher ?? entry.title,
        updatedAt: entry.observedAt,
        status: entry.reliability === 'low' ? ('stale' as const) : ('fresh' as const),
      })),
    ];
  }

  return context;
}

/** 懒加载单活动 context；任意有效 activityId 均可构建（不限于 selectInspectorActivityIds） */
export function buildJourneyMapInspectorActivityContext(
  activityId: string,
  input: BuildJourneyMapInspectorContextsInput,
): JourneyMapInspectorActivityContext | null {
  const itemById = buildItemByIdMap(input.itineraryItems);
  const resolved = resolveItineraryItem(itemById, activityId);
  if (!resolved) return null;
  return buildSingleInspectorActivityContext(resolved.canonicalId, resolved.item, input);
}

export function buildJourneyMapInspectorActivityContexts(
  input: BuildJourneyMapInspectorContextsInput,
): JourneyMapInspectorActivityContext[] {
  const activityIds = selectInspectorActivityIds(input);
  if (activityIds.length === 0) return [];

  const itemById = buildItemByIdMap(input.itineraryItems);

  const contexts = activityIds
    .map((activityId) => {
      const resolved = resolveItineraryItem(itemById, activityId);
      if (!resolved) return null;
      return buildSingleInspectorActivityContext(resolved.canonicalId, resolved.item, input);
    })
    .filter(Boolean) as JourneyMapInspectorActivityContext[];

  const seen = new Set<string>();
  return contexts.filter((ctx) => {
    if (seen.has(ctx.activityId)) return false;
    seen.add(ctx.activityId);
    return true;
  });
}
