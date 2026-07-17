import { haversineKm } from '../../trips/attraction-explore/utils/attraction-explore-place-coordinates.util';
import type {
  MobileSpatialRouteDto,
  SpatialRouteCandidateDetailDto,
  SpatialRouteDayMarkerDto,
  SpatialRouteMapDto,
  SpatialRouteMapMarkerDto,
  SpatialRouteMapPolylineDto,
  SpatialRouteSearchResultDto,
  SpatialRouteSelectedPoiDto,
  SpatialRouteWarningDto,
} from '../dto/mobile-planning.types';

export type SpatialRoutePlaceCoords = { lat: number; lng: number };

export type SpatialRouteDayPoiFact = {
  itemId: string;
  placeId?: number | null;
  title: string;
  category?: string | null;
  coords: SpatialRoutePlaceCoords | null;
};

export type SpatialRouteDayFact = {
  id: string;
  dayNumber: number;
  label: string;
  pois: SpatialRouteDayPoiFact[];
};

export type SpatialRouteCandidateFact = {
  id: string;
  placeId: number;
  title: string;
  region?: string;
  category?: string | null;
  priority?: string | null;
  coords: SpatialRoutePlaceCoords | null;
};

export type SpatialRouteRiskFact = {
  id: string;
  label: string;
  roadName: string;
  status: string;
  riskLevel: string;
  impactRange: string;
  updatedAt: string;
  coords?: SpatialRoutePlaceCoords | null;
};

export type ProjectSpatialRouteInput = {
  tripName: string;
  destinationLabel: string;
  focusDayIndex: number;
  days: SpatialRouteDayFact[];
  candidates: SpatialRouteCandidateFact[];
  risks?: SpatialRouteRiskFact[];
  contextVersion: number;
  planVersion?: number;
};

const PRIORITY_MATCH: Record<string, number> = {
  must: 95,
  very_interested: 88,
  interested: 72,
  maybe: 55,
  low: 40,
};

export function resolveSpatialRouteSystemImage(category?: string | null): string {
  const c = (category ?? '').toLowerCase();
  if (/waterfall|drop|瀑布|温泉水/.test(c)) return 'drop';
  if (/food|restaurant|用餐|餐厅|cafe/.test(c)) return 'fork.knife';
  if (/hotel|lodging|住宿|旅馆|accommodation/.test(c)) return 'bed.double.fill';
  if (/hike|trail|徒步/.test(c)) return 'figure.hiking';
  if (/beach|coast|海岸|沙滩/.test(c)) return 'beach.umbrella';
  if (/museum|文化/.test(c)) return 'building.columns';
  return 'mappin.and.ellipse';
}

export function resolveCandidateMatchPercent(priority?: string | null): number {
  if (!priority) return 70;
  return PRIORITY_MATCH[priority] ?? 70;
}

function formatKm(km: number): string {
  if (!Number.isFinite(km)) return '—';
  if (km < 1) return `${Math.round(km * 1000)}m`;
  return `${Math.round(km)}km`;
}

function estimateDetourMinutes(distanceKm: number): number {
  if (!Number.isFinite(distanceKm) || distanceKm <= 0) return 15;
  return Math.max(10, Math.min(120, Math.round((distanceKm / 50) * 60) + 15));
}

function focusDayCentroid(day: SpatialRouteDayFact | undefined): SpatialRoutePlaceCoords | null {
  if (!day) return null;
  const pts = day.pois.map((p) => p.coords).filter((c): c is SpatialRoutePlaceCoords => Boolean(c));
  if (pts.length === 0) return null;
  const lat = pts.reduce((s, p) => s + p.lat, 0) / pts.length;
  const lng = pts.reduce((s, p) => s + p.lng, 0) / pts.length;
  return { lat, lng };
}

function buildDayPolyline(day: SpatialRouteDayFact): SpatialRouteMapPolylineDto | null {
  const coordinates: Array<[number, number]> = [];
  for (const poi of day.pois) {
    if (!poi.coords) continue;
    coordinates.push([poi.coords.lng, poi.coords.lat]);
  }
  if (coordinates.length < 2) return null;
  return {
    id: `day-${day.dayNumber}-route`,
    dayNumber: day.dayNumber,
    coordinates,
    style: 'confirmed',
  };
}

function buildInsertionOptions(
  focusDayIndex: number,
): SpatialRouteCandidateDetailDto['insertionOptions'] {
  const day = Math.max(1, focusDayIndex);
  return [
    {
      id: `day-${day}-best`,
      title: `插入 Day ${day} 最佳时段`,
      detail: '按当前日路线最短绕行插入',
      drivingImpact: '+15–35 分钟',
      isRecommended: true,
      isSelected: true,
    },
    {
      id: `day-${day}-morning`,
      title: `Day ${day} 上午`,
      detail: '安排在上午活动之后',
      drivingImpact: '+20–45 分钟',
      isRecommended: false,
      isSelected: false,
    },
    {
      id: `day-${day}-afternoon`,
      title: `Day ${day} 下午`,
      detail: '安排在下午回程前',
      drivingImpact: '+25–50 分钟',
      isRecommended: false,
      isSelected: false,
    },
  ];
}

export function projectSearchResult(
  candidate: SpatialRouteCandidateFact,
  focusCenter: SpatialRoutePlaceCoords | null,
  focusDayNumber: number,
): SpatialRouteSearchResultDto {
  const matchPercent = resolveCandidateMatchPercent(candidate.priority);
  let distanceInfo = '距离待估算';
  let timeImpact = '影响：待估算';
  if (candidate.coords && focusCenter) {
    const km = haversineKm(
      focusCenter.lat,
      focusCenter.lng,
      candidate.coords.lat,
      candidate.coords.lng,
    );
    distanceInfo = `距离 Day${focusDayNumber}：${formatKm(km)}`;
    timeImpact = `影响：+${estimateDetourMinutes(km)} 分钟`;
  }
  return {
    id: candidate.id,
    title: candidate.title,
    distanceInfo,
    timeImpact,
    matchPercent,
    systemImage: resolveSpatialRouteSystemImage(candidate.category),
  };
}

export function projectCandidateDetail(
  candidate: SpatialRouteCandidateFact | undefined,
  focusCenter: SpatialRoutePlaceCoords | null,
  focusDayNumber: number,
): SpatialRouteCandidateDetailDto {
  if (!candidate) {
    return {
      title: '',
      region: '',
      distanceInfo: '',
      stayDuration: '',
      timeImpact: '',
      matchPercent: 0,
      tags: [],
      recommendReasons: [],
      impactMetrics: [],
      insertionOptions: buildInsertionOptions(focusDayNumber),
      aiRecommendation: '',
    };
  }

  const matchPercent = resolveCandidateMatchPercent(candidate.priority);
  let distanceKm = NaN;
  if (candidate.coords && focusCenter) {
    distanceKm = haversineKm(
      focusCenter.lat,
      focusCenter.lng,
      candidate.coords.lat,
      candidate.coords.lng,
    );
  }
  const detour = estimateDetourMinutes(distanceKm);
  const distanceInfo = Number.isFinite(distanceKm)
    ? `距离 Day${focusDayNumber}：${formatKm(distanceKm)}`
    : '距离待估算';
  const timeImpact = Number.isFinite(distanceKm) ? `影响：+${detour} 分钟` : '影响：待估算';

  return {
    title: candidate.title,
    region: candidate.region?.trim() || '周边',
    distanceInfo,
    stayDuration: '建议停留 1–2 小时',
    timeImpact,
    matchPercent,
    tags: [candidate.priority ?? '候选', candidate.category ?? '景点'].filter(Boolean),
    recommendReasons: [
      matchPercent >= 80 ? '与当前兴趣偏好高度匹配' : '可丰富当日体验层次',
      Number.isFinite(distanceKm) && distanceKm < 40
        ? '靠近当日路线，绕行可控'
        : '可评估是否改日前往',
    ],
    impactMetrics: [
      {
        icon: 'car',
        label: '驾车影响',
        value: Number.isFinite(distanceKm) ? `+${detour} 分钟` : '—',
        tag: '估算',
      },
      {
        icon: 'map',
        label: '距焦点日',
        value: Number.isFinite(distanceKm) ? formatKm(distanceKm) : '—',
        tag: `Day ${focusDayNumber}`,
      },
      {
        icon: 'percent',
        label: '匹配度',
        value: `${matchPercent}%`,
        tag: '偏好',
      },
    ],
    insertionOptions: buildInsertionOptions(focusDayNumber),
    aiRecommendation:
      Number.isFinite(distanceKm) && distanceKm < 50
        ? `建议插入 Day ${focusDayNumber}，预期绕行约 +${detour} 分钟。确认前不会写入正式行程。`
        : `距离较远，可改日或放弃；未确认不会写入正式行程。`,
  };
}

function projectSelectedPoi(
  searchResults: SpatialRouteSearchResultDto[],
  confirmedTitle: string | undefined,
): SpatialRouteSelectedPoiDto {
  const top = searchResults[0];
  if (top) {
    return {
      title: top.title,
      distanceFromDay: top.distanceInfo,
      timeImpact: top.timeImpact,
      matchPercent: top.matchPercent,
      systemImage: top.systemImage,
    };
  }
  if (confirmedTitle) {
    return {
      title: confirmedTitle,
      distanceFromDay: '',
      timeImpact: '',
      matchPercent: 100,
      systemImage: 'mappin.and.ellipse',
    };
  }
  return {
    title: '',
    distanceFromDay: '',
    timeImpact: '',
    matchPercent: 0,
    systemImage: 'mappin.and.ellipse',
  };
}

function projectRouteWarning(risks: SpatialRouteRiskFact[]): SpatialRouteWarningDto {
  const top = risks[0];
  if (!top) {
    return {
      label: '',
      roadName: '',
      status: '',
      riskLevel: '',
      impactRange: '',
      updatedAt: '',
    };
  }
  return {
    label: top.label,
    roadName: top.roadName,
    status: top.status,
    riskLevel: top.riskLevel,
    impactRange: top.impactRange,
    updatedAt: top.updatedAt,
  };
}

function buildMap(
  days: SpatialRouteDayFact[],
  candidates: SpatialRouteCandidateFact[],
  risks: SpatialRouteRiskFact[],
): SpatialRouteMapDto {
  const polylines: SpatialRouteMapPolylineDto[] = [];
  for (const day of days) {
    const line = buildDayPolyline(day);
    if (line) polylines.push(line);
  }

  const markers: SpatialRouteMapMarkerDto[] = [];
  for (const day of days) {
    for (const poi of day.pois) {
      if (!poi.coords) continue;
      markers.push({
        id: `confirmed-${poi.itemId}`,
        type: 'confirmedPOI',
        lat: poi.coords.lat,
        lng: poi.coords.lng,
        label: poi.title,
      });
    }
  }
  for (const candidate of candidates) {
    if (!candidate.coords) continue;
    markers.push({
      id: `candidate-${candidate.id}`,
      type: 'candidatePOI',
      lat: candidate.coords.lat,
      lng: candidate.coords.lng,
      label: candidate.title,
    });
  }
  for (const risk of risks) {
    if (!risk.coords) continue;
    markers.push({
      id: `risk-${risk.id}`,
      type: 'riskPoint',
      lat: risk.coords.lat,
      lng: risk.coords.lng,
      label: risk.label || risk.roadName,
    });
  }

  return {
    polylines,
    markers,
    riskZones: [],
  };
}

/**
 * Project planning spatial-route Tab read model.
 * Coordinates in `map.polylines` / `riskZones` are [lng, lat].
 */
export function projectSpatialRouteViewData(input: ProjectSpatialRouteInput): MobileSpatialRouteDto {
  const focusDayIndex = Math.max(1, input.focusDayIndex || 1);
  const focusDay =
    input.days.find((d) => d.dayNumber === focusDayIndex) ?? input.days[0];
  const focusDayNumber = focusDay?.dayNumber ?? focusDayIndex;
  const focusCenter = focusDayCentroid(focusDay);
  const risks = input.risks ?? [];

  const dayMarkers: SpatialRouteDayMarkerDto[] = input.days.map((day) => ({
    id: day.id,
    dayNumber: day.dayNumber,
    label: day.label || `Day ${day.dayNumber}`,
    isConfirmed: day.pois.length > 0,
  }));

  const searchResults = input.candidates
    .slice(0, 20)
    .map((c) => projectSearchResult(c, focusCenter, focusDayNumber));

  const primaryCandidate = input.candidates[0];
  const candidateDetail = projectCandidateDetail(primaryCandidate, focusCenter, focusDayNumber);
  const selectedPOI = projectSelectedPoi(
    searchResults,
    focusDay?.pois.find((p) => p.coords)?.title,
  );
  const routeWarning = projectRouteWarning(risks);
  const map = buildMap(input.days, input.candidates, risks);

  const confirmedPoiCount = map.markers.filter((m) => m.type === 'confirmedPOI').length;
  const candidatePoiCount = map.markers.filter((m) => m.type === 'candidatePOI').length;
  const riskPointCount = map.markers.filter((m) => m.type === 'riskPoint').length;

  const tripLabel = input.tripName?.trim() || input.destinationLabel?.trim() || '行程';
  const planningHint =
    map.polylines.length === 0 && confirmedPoiCount === 0
      ? '暂无正式路线几何，可先完善行程日'
      : '规划中';
  const pageSubtitle = `${tripLabel} · Day ${focusDayNumber} · ${planningHint}`;

  const hasRisk = Boolean(routeWarning.label);
  const aiInsight = hasRisk
    ? {
        title: '道路风险需关注',
        detail: `${routeWarning.roadName || routeWarning.label}：${routeWarning.status || routeWarning.riskLevel}`,
        suggestion: '查看道路风险详情，评估是否改日或调整插入位点',
      }
    : searchResults.length > 0
      ? {
          title: '发现可插入候选',
          detail: `当前有 ${searchResults.length} 个候选 POI，可评估对 Day ${focusDayNumber} 的绕行影响`,
          suggestion: '先查看候选详情，确认插入选项后再写入正式行程',
        }
      : {
          title: '空间路线概览',
          detail:
            confirmedPoiCount > 0
              ? `已投影 ${confirmedPoiCount} 个确认地点与 ${map.polylines.length} 条日路线`
              : '尚无确认路线，添加行程点后将自动生成地图几何',
          suggestion: '可在地图上搜索并评估候选地点',
        };

  return {
    dayMarkers,
    selectedPOI,
    aiInsight,
    routeWarning,
    pageSubtitle,
    layerSummary: {
      confirmedRoutes: map.polylines.length,
      candidatePOIs: candidatePoiCount,
      riskPoints: riskPointCount,
      memberPreferences: 0,
      routeElements: map.polylines.length + confirmedPoiCount,
      poiCount: confirmedPoiCount + candidatePoiCount,
    },
    searchResults,
    candidateDetail,
    aiSuggestionDetail: {
      alertMessage: hasRisk ? routeWarning.label : aiInsight.title,
      alertNote: hasRisk ? routeWarning.impactRange : aiInsight.detail,
      happened: hasRisk ? routeWarning.status : '',
      affected: hasRisk ? routeWarning.roadName : `Day ${focusDayNumber}`,
      options: candidateDetail.insertionOptions.map((o) => o.title).join(' / '),
      recommendation: candidateDetail.aiRecommendation || aiInsight.suggestion,
      currentDriving: '',
      currentDistance: '',
      currentIntensity: '',
      currentStatus: planningHint,
      optimizedDriving: '',
      optimizedDistance: '',
      optimizedIntensity: '',
      optimizedStatus: '',
      optimizedSummary: aiInsight.suggestion,
      evidenceItems: hasRisk
        ? [
            {
              title: routeWarning.label || '道路风险',
              detail: `${routeWarning.roadName} · ${routeWarning.riskLevel} · ${routeWarning.updatedAt}`,
            },
          ]
        : [],
    },
    map,
    contextVersion: input.contextVersion,
    planVersion: input.planVersion,
  };
}

export function isValidInsertionOptionId(optionId: string, dayIndex: number): boolean {
  const day = Math.max(1, dayIndex);
  return buildInsertionOptions(day).some((o) => o.id === optionId);
}

export function resolveSlotTimeFromInsertionOption(
  insertionOptionId: string,
  slotTime?: string,
): string {
  if (slotTime?.trim()) return slotTime.trim();
  if (insertionOptionId.endsWith('-morning')) return '10:00';
  if (insertionOptionId.endsWith('-afternoon')) return '14:00';
  return '11:00';
}

export function projectSpatialSearchItems(input: {
  candidates: SpatialRouteCandidateFact[];
  focusCenter: SpatialRoutePlaceCoords | null;
  focusDayNumber: number;
  limit?: number;
}): SpatialRouteSearchResultDto[] {
  const limit = Math.max(1, Math.min(50, input.limit ?? 20));
  return input.candidates
    .slice(0, limit)
    .map((c) => projectSearchResult(c, input.focusCenter, input.focusDayNumber));
}

export function projectSpatialRoadRisks(input: {
  risks: SpatialRouteRiskFact[];
  evidence?: Array<{
    source: string;
    detail: string;
    updatedAt: string;
    sourceURL?: string;
  }>;
  contextVersion: number;
  planVersion?: number;
}): {
  alertTitle: string;
  alertDetail: string;
  items: SpatialRouteWarningDto[];
  evidence: Array<{
    source: string;
    detail: string;
    updatedAt: string;
    sourceURL?: string;
  }>;
  contextVersion: number;
  planVersion?: number;
} {
  const items = input.risks.map((r) => ({
    label: r.label,
    roadName: r.roadName,
    status: r.status,
    riskLevel: r.riskLevel,
    impactRange: r.impactRange,
    updatedAt: r.updatedAt,
  }));
  const top = items[0];
  return {
    alertTitle: top?.label || '暂无道路风险',
    alertDetail: top
      ? `${top.roadName || '相关路段'}：${top.status || top.riskLevel}`
      : '当前未检测到显著道路风险',
    items,
    evidence:
      input.evidence ??
      input.risks.slice(0, 5).map((r) => ({
        source: 'worldFacts',
        detail: `${r.label} · ${r.roadName} · ${r.riskLevel}`,
        updatedAt: r.updatedAt,
      })),
    contextVersion: input.contextVersion,
    planVersion: input.planVersion,
  };
}

export function focusDayCentroidFromDays(
  days: SpatialRouteDayFact[],
  focusDayNumber: number,
): SpatialRoutePlaceCoords | null {
  const day = days.find((d) => d.dayNumber === focusDayNumber) ?? days[0];
  return focusDayCentroid(day);
}
