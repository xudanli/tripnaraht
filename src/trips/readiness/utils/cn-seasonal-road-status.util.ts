/**
 * 中国路况：季节窗 + 走廊粗定位（非准实时交警）。
 * 目标：消灭 DefaultRoadStatusAdapter 对 CN 的「永远 isOpen + riskLevel 0」。
 */
import {
  evaluateCnClassicSeasonWindows,
  type CnSeasonWindowHit,
} from './cn-classic-season-windows.util';

export type CnRoadSemanticStatus = 'OPEN' | 'LIMITED' | 'CLOSED' | 'UNKNOWN';

export type CnResolvedSeasonalRoadStatus = {
  isOpen: boolean;
  riskLevel: 0 | 1 | 2 | 3;
  reason: string;
  source: 'cn.seasonal-advisory';
  /** 供 destination-pack cn-road-rules 消费 */
  roadStatus: CnRoadSemanticStatus;
  classicRouteIds: string[];
  seasonWindowIds: string[];
  evidenceGrade: 'seasonal_static';
  noteZh: string;
  asOfDate: string;
};

const NO_REALTIME_NOTE =
  '无准实时交警源；本结果仅基于经典线季节窗与走廊粗定位，须核验当地交警/气象通告。';

/** 走廊粗 bbox → 经典线（示意，非测绘边界） */
const CORRIDOR_BOXES: Array<{
  classicRouteId: string;
  latMin: number;
  latMax: number;
  lngMin: number;
  lngMax: number;
}> = [
  {
    classicRouteId: 'cn.route.duku',
    latMin: 41.5,
    latMax: 44.8,
    lngMin: 83.5,
    lngMax: 85.8,
  },
  {
    classicRouteId: 'cn.route.g318',
    latMin: 28.5,
    latMax: 33.5,
    lngMin: 90.0,
    lngMax: 104.5,
  },
  {
    classicRouteId: 'cn.route.g317',
    latMin: 30.5,
    latMax: 34.5,
    lngMin: 90.0,
    lngMax: 104.0,
  },
  {
    classicRouteId: 'cn.route.qinggan_loop',
    latMin: 35.0,
    latMax: 41.5,
    lngMin: 93.0,
    lngMax: 103.5,
  },
  {
    classicRouteId: 'cn.route.g219',
    latMin: 29.0,
    latMax: 38.0,
    lngMin: 78.0,
    lngMax: 90.0,
  },
  {
    classicRouteId: 'cn.route.dianzang',
    latMin: 25.0,
    latMax: 30.5,
    lngMin: 98.0,
    lngMax: 102.5,
  },
  {
    classicRouteId: 'cn.route.g211',
    latMin: 25.5,
    latMax: 39.0,
    lngMin: 105.0,
    lngMax: 109.5,
  },
];

export function inferCnClassicRouteIdsFromLatLng(
  lat: number,
  lng: number,
): string[] {
  return CORRIDOR_BOXES.filter(
    (b) =>
      lat >= b.latMin &&
      lat <= b.latMax &&
      lng >= b.lngMin &&
      lng <= b.lngMax,
  ).map((b) => b.classicRouteId);
}

function todayIsoUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

function severityToRisk(severity: 'low' | 'medium' | 'high'): 1 | 2 | 3 {
  if (severity === 'high') return 3;
  if (severity === 'medium') return 2;
  return 1;
}

function collectHits(
  routeIds: string[],
  asOfDate: string,
): CnSeasonWindowHit[] {
  const all: CnSeasonWindowHit[] = [];
  for (const routeId of routeIds) {
    all.push(
      ...evaluateCnClassicSeasonWindows({
        routeId,
        startDate: asOfDate,
        endDate: asOfDate,
      }),
    );
  }
  return all;
}

/**
 * 解析中国季节性路况。
 * - open_window 外 → CLOSED（如独库非开放季）
 * - risk_window 命中 → LIMITED + 升高 riskLevel
 * - 无走廊命中 → UNKNOWN，riskLevel≥1（禁止假安全 0）
 */
export function resolveCnSeasonalRoadStatus(input: {
  lat?: number | null;
  lng?: number | null;
  classicRouteId?: string | null;
  asOfDate?: string | null;
}): CnResolvedSeasonalRoadStatus {
  const asOfDate =
    (input.asOfDate && /^\d{4}-\d{2}-\d{2}/.test(input.asOfDate)
      ? input.asOfDate.slice(0, 10)
      : null) || todayIsoUtc();

  const fromQuery = (input.classicRouteId ?? '').trim();
  const fromGeo =
    input.lat != null &&
    input.lng != null &&
    Number.isFinite(input.lat) &&
    Number.isFinite(input.lng)
      ? inferCnClassicRouteIdsFromLatLng(input.lat, input.lng)
      : [];

  const classicRouteIds = [
    ...new Set([...(fromQuery ? [fromQuery] : []), ...fromGeo]),
  ];

  const hits = classicRouteIds.length
    ? collectHits(classicRouteIds, asOfDate)
    : [];

  const closedHits = hits.filter((h) => h.outsideOpenWindow);
  const riskHits = hits.filter(
    (h) => h.kind === 'risk_window' && h.overlappingMonths.length > 0,
  );

  if (closedHits.length) {
    const worst = closedHits.reduce((a, b) =>
      severityToRisk(a.severity) >= severityToRisk(b.severity) ? a : b,
    );
    return {
      isOpen: false,
      riskLevel: severityToRisk(worst.severity),
      reason: worst.summaryCN,
      source: 'cn.seasonal-advisory',
      roadStatus: 'CLOSED',
      classicRouteIds,
      seasonWindowIds: closedHits.map((h) => h.windowId),
      evidenceGrade: 'seasonal_static',
      noteZh: NO_REALTIME_NOTE,
      asOfDate,
    };
  }

  if (riskHits.length) {
    const worst = riskHits.reduce((a, b) =>
      severityToRisk(a.severity) >= severityToRisk(b.severity) ? a : b,
    );
    // 雨季等高风险窗口：可通行但受限，risk 封顶 2（与 CLOSED=3 区分）
    const riskLevel = Math.min(2, severityToRisk(worst.severity)) as 1 | 2;
    return {
      isOpen: true,
      riskLevel,
      reason: worst.summaryCN,
      source: 'cn.seasonal-advisory',
      roadStatus: 'LIMITED',
      classicRouteIds,
      seasonWindowIds: riskHits.map((h) => h.windowId),
      evidenceGrade: 'seasonal_static',
      noteZh: NO_REALTIME_NOTE,
      asOfDate,
    };
  }

  if (classicRouteIds.length) {
    return {
      isOpen: true,
      riskLevel: 1,
      reason: '命中经典走廊，当前日期未落在高风险/封闭季节窗；仍须核验当日通告。',
      source: 'cn.seasonal-advisory',
      roadStatus: 'UNKNOWN',
      classicRouteIds,
      seasonWindowIds: [],
      evidenceGrade: 'seasonal_static',
      noteZh: NO_REALTIME_NOTE,
      asOfDate,
    };
  }

  return {
    isOpen: true,
    riskLevel: 1,
    reason: '中国境内无走廊/经典线匹配，且无准实时路况源。',
    source: 'cn.seasonal-advisory',
    roadStatus: 'UNKNOWN',
    classicRouteIds: [],
    seasonWindowIds: [],
    evidenceGrade: 'seasonal_static',
    noteZh: NO_REALTIME_NOTE,
    asOfDate,
  };
}

export function cnSeasonalRoadStatusToContract(
  resolved: CnResolvedSeasonalRoadStatus,
): {
  isOpen: boolean;
  riskLevel: 0 | 1 | 2 | 3;
  reason: string;
  lastUpdated: Date;
  source: string;
  metadata: Record<string, unknown>;
} {
  return {
    isOpen: resolved.isOpen,
    riskLevel: resolved.riskLevel,
    reason: resolved.reason,
    lastUpdated: new Date(),
    source: resolved.source,
    metadata: {
      roadStatus: resolved.roadStatus,
      classicRouteIds: resolved.classicRouteIds,
      seasonWindowIds: resolved.seasonWindowIds,
      evidenceGrade: resolved.evidenceGrade,
      asOfDate: resolved.asOfDate,
      noteZh: resolved.noteZh,
      realtime: false,
    },
  };
}
