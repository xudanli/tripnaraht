/**
 * 中国自驾 driving-context：限行 / 涉藏高原 / 季节窗 / 段距离阈值 pack。
 * 供 HTTP 查询与 Trip.metadata.drivingContext。
 */
import { getCountryPack } from '../config/country-pack.config';
import {
  cnCityDrivingLimitDisclaimer,
  lookupCnCityDrivingLimit,
  type CnCityDrivingLimit,
} from './cn-city-driving-limits.util';
import {
  classicRoutesWantSichuan,
  classicRoutesWantXizang,
  getCnClassicRouteById,
  type CnClassicRoute,
} from './cn-classic-routes.util';
import {
  cnClassicSeasonWindowsDisclaimer,
  evaluateCnClassicSeasonWindows,
  type CnSeasonWindowHit,
} from './cn-classic-season-windows.util';
import { resolveCnDrivingThresholdPackCode } from './cn-driving-threshold-pack.util';
import { resolveCnDrivingLimitCity } from './cn-regional-pack-select.util';
import {
  resolveCnSeasonalRoadStatus,
  type CnResolvedSeasonalRoadStatus,
} from './cn-seasonal-road-status.util';
import {
  buildCnTibetCheckpointPlaybookMeta,
  getCnTibetCheckpointPlaybook,
} from './cn-tibet-checkpoint-playbook.util';

export type CnDrivingContextCityLimit = {
  cityCN: string;
  cityEN: string;
  severity: CnCityDrivingLimit['severity'];
  limitType: string;
  summaryCN: string;
  summaryEN: string;
  officialHintUrl?: string;
};

export type CnDrivingContext = {
  countryCode: 'CN';
  classicRouteId: string | null;
  routeNameCN: string | null;
  regions: string[];
  wantsXizang: boolean;
  wantsSichuan: boolean;
  requiresAltitudeAcclimatization: boolean;
  checkpointLikely: boolean;
  etcRecommended: boolean;
  drivingThresholdPackCode: string;
  drivingSegmentThresholds: {
    maxSegmentDistanceKm: number;
    warnSegmentDistanceKm: number;
    winterWarnSegmentDistanceKm?: number;
  } | null;
  cityDrivingLimits: CnDrivingContextCityLimit[];
  seasonWindowHits: CnSeasonWindowHit[];
  /** 季节/走廊路况提示（非准实时） */
  roadStatusHint: Pick<
    CnResolvedSeasonalRoadStatus,
    'isOpen' | 'riskLevel' | 'roadStatus' | 'reason' | 'source' | 'seasonWindowIds' | 'evidenceGrade'
  >;
  advisoriesCN: string[];
  advisoriesEN: string[];
  /** 涉藏试点 playbook 摘要（仅 wantsXizang 时非空） */
  tibetCheckpointPlaybook: Record<string, unknown> | null;
  disclaimer: string;
};

function toCityLimit(hit: CnCityDrivingLimit): CnDrivingContextCityLimit {
  return {
    cityCN: hit.cityCN,
    cityEN: hit.cityEN,
    severity: hit.severity,
    limitType: hit.limitType,
    summaryCN: hit.summaryCN,
    summaryEN: hit.summaryEN,
    officialHintUrl: hit.officialHintUrl,
  };
}

function collectCityLimits(
  route: CnClassicRoute | null,
  cityHints: Array<string | null | undefined> | null | undefined,
): CnDrivingContextCityLimit[] {
  const seen = new Set<string>();
  const out: CnDrivingContextCityLimit[] = [];
  const candidates = [
    ...(cityHints ?? []).map((h) => String(h || '')),
    ...(route?.anchorPlaces ?? []),
  ];

  for (const raw of candidates) {
    const key = resolveCnDrivingLimitCity([raw]) ?? raw.trim();
    if (!key || seen.has(key)) continue;
    const hit = lookupCnCityDrivingLimit(key);
    if (!hit) continue;
    seen.add(hit.cityCN);
    out.push(toCityLimit(hit));
  }
  return out;
}

function buildAdvisories(input: {
  route: CnClassicRoute | null;
  wantsXizang: boolean;
  wantsSichuan: boolean;
  cityLimits: CnDrivingContextCityLimit[];
  seasonHits: CnSeasonWindowHit[];
  roadStatusHint?: {
    roadStatus: string;
    reason: string;
    isOpen: boolean;
  };
}): { advisoriesCN: string[]; advisoriesEN: string[] } {
  const advisoriesCN: string[] = [];
  const advisoriesEN: string[] = [];

  if (input.roadStatusHint && input.roadStatusHint.roadStatus !== 'OPEN') {
    const tag = input.roadStatusHint.isOpen ? '路况受限' : '路段封闭示意';
    advisoriesCN.push(`${tag}：${input.roadStatusHint.reason}`);
    advisoriesEN.push(
      `Road advisory (${input.roadStatusHint.roadStatus}): ${input.roadStatusHint.reason}`,
    );
  }

  if (input.wantsXizang) {
    advisoriesCN.push('涉藏行程：安排高反适应，核验检查站/证件，勿无缓冲急升。');
    advisoriesEN.push(
      'Tibet-related: plan acclimatization, checkpoints/permits; avoid rapid ascent.',
    );
    const playbook = getCnTibetCheckpointPlaybook();
    for (const a of playbook.advisoriesCN) {
      if (!advisoriesCN.includes(a)) advisoriesCN.push(a);
    }
    for (const a of playbook.advisoriesEN) {
      if (!advisoriesEN.includes(a)) advisoriesEN.push(a);
    }
  } else if (input.wantsSichuan) {
    advisoriesCN.push('川西山路：控制单段里程，关注雨季塌方与垭口天气。');
    advisoriesEN.push(
      'West Sichuan: control daily distance; watch monsoon landslides and pass weather.',
    );
  }

  for (const c of input.cityLimits.slice(0, 3)) {
    advisoriesCN.push(`${c.cityCN}限行：${c.summaryCN}`);
    advisoriesEN.push(`${c.cityEN} limits: ${c.summaryEN}`);
  }

  for (const s of input.seasonHits.filter((h) => h.severity !== 'low').slice(0, 3)) {
    if (!advisoriesCN.includes(s.summaryCN)) advisoriesCN.push(s.summaryCN);
    if (!advisoriesEN.includes(s.summaryEN)) advisoriesEN.push(s.summaryEN);
  }

  if (input.route?.mustHintsCN?.length) {
    for (const h of input.route.mustHintsCN.slice(0, 2)) {
      if (!advisoriesCN.includes(h)) advisoriesCN.push(h);
    }
  }

  return { advisoriesCN, advisoriesEN };
}

export function buildCnDrivingContext(input: {
  classicRouteId?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  cityHints?: Array<string | null | undefined> | null;
}): CnDrivingContext {
  const classicRouteId = (input.classicRouteId ?? '').trim() || null;
  const route = classicRouteId ? getCnClassicRouteById(classicRouteId) : null;
  const routes = route ? [route] : [];
  const wantsXizang = classicRoutesWantXizang(routes);
  const wantsSichuan = classicRoutesWantSichuan(routes);
  const drivingThresholdPackCode = resolveCnDrivingThresholdPackCode({
    destination: 'CN',
    classicRouteId,
  });
  const pack = getCountryPack(drivingThresholdPackCode);
  const thresholds = pack.drivingSegmentThresholds ?? null;
  const cityDrivingLimits = collectCityLimits(route, input.cityHints);
  const seasonWindowHits = classicRouteId
    ? evaluateCnClassicSeasonWindows({
        routeId: classicRouteId,
        startDate: input.startDate,
        endDate: input.endDate,
      })
    : [];

  const roadResolved = resolveCnSeasonalRoadStatus({
    classicRouteId,
    asOfDate: input.startDate || input.endDate || null,
  });
  const roadStatusHint = {
    isOpen: roadResolved.isOpen,
    riskLevel: roadResolved.riskLevel,
    roadStatus: roadResolved.roadStatus,
    reason: roadResolved.reason,
    source: roadResolved.source,
    seasonWindowIds: roadResolved.seasonWindowIds,
    evidenceGrade: roadResolved.evidenceGrade,
  };

  const { advisoriesCN, advisoriesEN } = buildAdvisories({
    route,
    wantsXizang,
    wantsSichuan,
    cityLimits: cityDrivingLimits,
    seasonHits: seasonWindowHits,
    roadStatusHint,
  });

  const tibetCheckpointPlaybook = wantsXizang
    ? buildCnTibetCheckpointPlaybookMeta()
    : null;

  const disclaimer = [
    cnClassicSeasonWindowsDisclaimer(),
    cnCityDrivingLimitDisclaimer(),
    roadResolved.noteZh,
    wantsXizang ? getCnTibetCheckpointPlaybook().disclaimer : '',
  ]
    .filter(Boolean)
    .join(' ');

  return {
    countryCode: 'CN',
    classicRouteId,
    routeNameCN: route?.nameCN ?? null,
    regions: route?.regions?.slice() ?? [],
    wantsXizang,
    wantsSichuan,
    requiresAltitudeAcclimatization: wantsXizang || wantsSichuan,
    checkpointLikely: wantsXizang,
    etcRecommended: true,
    drivingThresholdPackCode,
    drivingSegmentThresholds: thresholds
      ? {
          maxSegmentDistanceKm: thresholds.maxSegmentDistanceKm,
          warnSegmentDistanceKm: thresholds.warnSegmentDistanceKm,
          winterWarnSegmentDistanceKm: thresholds.winterWarnSegmentDistanceKm,
        }
      : null,
    cityDrivingLimits,
    seasonWindowHits,
    roadStatusHint,
    advisoriesCN,
    advisoriesEN,
    tibetCheckpointPlaybook,
    disclaimer,
  };
}

/** 写入 Trip.metadata 的精简投影（避免撑爆 metadata） */
export function toCnDrivingContextMetadataProjection(
  ctx: CnDrivingContext,
): Record<string, unknown> {
  return {
    classicRouteId: ctx.classicRouteId,
    wantsXizang: ctx.wantsXizang,
    wantsSichuan: ctx.wantsSichuan,
    requiresAltitudeAcclimatization: ctx.requiresAltitudeAcclimatization,
    checkpointLikely: ctx.checkpointLikely,
    etcRecommended: ctx.etcRecommended,
    drivingThresholdPackCode: ctx.drivingThresholdPackCode,
    cityLimitCities: ctx.cityDrivingLimits.map((c) => c.cityCN),
    seasonWindowIds: ctx.seasonWindowHits.map((h) => h.windowId),
    highSeveritySeasonHits: ctx.seasonWindowHits
      .filter((h) => h.severity === 'high')
      .map((h) => h.windowId),
    roadStatus: ctx.roadStatusHint.roadStatus,
    roadRiskLevel: ctx.roadStatusHint.riskLevel,
    advisoriesCN: ctx.advisoriesCN.slice(0, 5),
    ...(ctx.tibetCheckpointPlaybook
      ? {
          tibetCheckpointPlaybookId: ctx.tibetCheckpointPlaybook.playbook_id,
          tibetCheckpointPlaybookVersion: ctx.tibetCheckpointPlaybook.version,
        }
      : {}),
  };
}
