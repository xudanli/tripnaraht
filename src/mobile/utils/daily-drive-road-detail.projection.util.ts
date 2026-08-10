/**
 * 今日自驾 — ROAD 路况详情投影（对齐截图）
 */

import { haversineKm } from '../../trips/attraction-explore/utils/attraction-explore-place-coordinates.util';
import { loadIcelandSafeStopCatalog } from '../../decision-runtime/packs/knowledge/road/iceland-safe-stop.loader';
import type { PlaceParkingRow } from '../../decision-runtime/packs/knowledge/road/load-iceland-parking-from-place';
import type {
  DailyDriveDetailSeverity,
  DailyDriveDimensionStatus,
  DailyDriveRoadDetailDto,
  DailyDriveRoadParkingSpot,
  DailyDriveRoadSegmentRow,
  DailyDriveRoadStatRow,
} from '../dto/mobile-daily-drive.types';
import { DAILY_DRIVE_DIMENSION_SCHEMA_IDS } from '../dto/mobile-daily-drive.types';

export type RoadDetailContext = {
  localDate: string;
  timezone: string;
  tripLabelZh: string;
  dayLabelZh: string;
  contextVersion?: number;
  summaryStatus: DailyDriveDimensionStatus;
  summaryDetailZh: string;
};

export type RoadDetailItemInput = {
  title: string;
  time?: string;
  endTime?: string;
  status?: string;
  travelFromPreviousKm?: number | null;
  travelFromPreviousMin?: number | null;
  lat?: number;
  lng?: number;
};

export type RoadDetailProjectionInput = {
  items?: RoadDetailItemInput[];
  routeNodesZh?: string[];
  routeSummaryZh?: string;
  alertTitle?: string;
  alertDetail?: string;
  envEvents?: Array<{ description?: string; severity?: string }>;
  plowServiceBand?: string;
  plowDelayRangeMin?: [number, number];
  /** 明确横风/碎石等提示 */
  crosswind?: boolean;
  gravelKm?: number;
  ringRoadPrimary?: boolean;
  nextChangeInMin?: number;
  arrivalWindowZh?: string;
  /** 当前位置（用于安全停车点排序） */
  originLat?: number;
  originLng?: number;
  /** Place 库 OSM 停车点（优先于 pack catalog） */
  placeParking?: PlaceParkingRow[];
};

const AVG_DRIVE_KMH = 80;
const RUNBOOK_POLICY_ZH =
  '系统仅在封路或不安全条件出现时触发 Runbook';

function mapStatusToDetailSeverity(
  status: DailyDriveDimensionStatus,
): DailyDriveDetailSeverity {
  if (status === 'BLOCKED') return 'BLOCKED';
  if (status === 'ATTENTION') return 'ATTENTION';
  return 'OK';
}

function formatDurationZh(totalMin: number): string {
  const n = Math.max(1, Math.round(totalMin));
  if (n < 60) return `${n} 分钟`;
  const h = Math.floor(n / 60);
  const m = n % 60;
  return m > 0 ? `${h} 小时 ${m} 分` : `${h} 小时`;
}

function shortNodeName(name: string): string {
  const t = name.trim();
  if (t.length <= 18) return t;
  // 取括号前或截断
  const before = t.split(/[（(]/)[0]?.trim();
  if (before && before.length >= 2 && before.length <= 18) return before;
  return `${t.slice(0, 16)}…`;
}

function inferRouteSummaryZh(input: RoadDetailProjectionInput): string {
  if (input.routeSummaryZh) return input.routeSummaryZh;
  const parts: string[] = [];
  if (input.ringRoadPrimary !== false) parts.push('1号公路为主');
  const gravel = input.gravelKm ?? 0;
  if (gravel > 0) parts.push(`含少量碎石路`);
  else parts.push('以铺装路为主');
  return parts.join('，');
}

function heroTitle(severity: DailyDriveDetailSeverity): string {
  if (severity === 'BLOCKED') return '当前计划路段暂缓通行';
  if (severity === 'ATTENTION' || severity === 'CAUTION') {
    return '当前计划路段可通行，需注意风险';
  }
  return '当前计划路段可通行';
}

function computeDistances(items: RoadDetailItemInput[]): {
  totalKm: number;
  progressKm: number;
} {
  let totalKm = 0;
  let progressKm = 0;
  for (let i = 0; i < items.length; i++) {
    const item = items[i]!;
    let legKm =
      typeof item.travelFromPreviousKm === 'number' && item.travelFromPreviousKm > 0
        ? item.travelFromPreviousKm
        : 0;
    if (legKm <= 0 && i > 0) {
      const prev = items[i - 1]!;
      if (
        prev.lat != null &&
        prev.lng != null &&
        item.lat != null &&
        item.lng != null
      ) {
        legKm = Math.round(haversineKm(prev.lat, prev.lng, item.lat, item.lng) * 1.25 * 10) / 10;
      }
    }
    totalKm += legKm;
    if (item.status === 'completed' || item.status === 'done') {
      progressKm += legKm;
    } else if (item.status === 'inProgress' || item.status === 'current') {
      progressKm += legKm * 0.5;
    }
  }
  return {
    totalKm: Math.round(totalKm),
    progressKm: Math.round(progressKm),
  };
}

function buildSegments(
  nodes: string[],
  items: RoadDetailItemInput[],
  severity: DailyDriveDetailSeverity,
  input: RoadDetailProjectionInput,
): DailyDriveRoadSegmentRow[] {
  if (nodes.length >= 2) {
    const out: DailyDriveRoadSegmentRow[] = [];
    for (let i = 0; i < nodes.length - 1; i++) {
      const from = shortNodeName(nodes[i]!);
      const to = shortNodeName(nodes[i + 1]!);
      let statusZh = '正常';
      let segSeverity: DailyDriveDetailSeverity = 'OK';
      if (i === 0 && severity === 'BLOCKED') {
        statusZh = '暂缓';
        segSeverity = 'BLOCKED';
      } else if (input.crosswind && i === Math.min(1, nodes.length - 2)) {
        statusZh = '横风注意';
        segSeverity = 'ATTENTION';
      } else if (severity === 'ATTENTION' && i === 0) {
        statusZh = '注意';
        segSeverity = 'ATTENTION';
      } else if (i === 0) {
        statusZh = '开放';
        segSeverity = 'OK';
      }
      out.push({
        titleZh: `1号公路 ${from} → ${to}`,
        statusZh,
        severity: segSeverity,
      });
    }
    return out.slice(0, 4);
  }

  // fallback from env timeline-like alerts
  const fromEnv = (input.envEvents ?? [])
    .filter((e) => e.description)
    .slice(0, 3)
    .map((e) => {
      const high = e.severity === 'red' || e.severity === 'high';
      const mid = e.severity === 'yellow' || e.severity === 'medium';
      return {
        titleZh: (e.description ?? '路段').slice(0, 80),
        statusZh: high ? '需警惕' : mid ? '注意' : '开放',
        severity: (high ? 'BLOCKED' : mid ? 'ATTENTION' : 'OK') as DailyDriveDetailSeverity,
      };
    });
  if (fromEnv.length) return fromEnv;

  return [
    {
      titleZh: input.alertTitle ?? '计划路段',
      statusZh:
        severity === 'OK' ? '开放' : severity === 'BLOCKED' ? '暂缓' : '注意',
      severity,
    },
  ];
}

function buildRiskNotes(
  input: RoadDetailProjectionInput,
  severity: DailyDriveDetailSeverity,
): string[] {
  const notes: string[] = [];
  const blob = `${input.alertDetail ?? ''} ${input.alertTitle ?? ''}`.toLowerCase();
  const closed = /封|关闭|closed|不通|不建议|暂缓|blocked/.test(blob) || severity === 'BLOCKED';
  notes.push(closed ? '存在通行受限或不建议按原计划出发的条件' : '无封路');

  if (input.crosswind || /横风|侧风|cross.?wind|wind/.test(blob)) {
    notes.push('部分路段可能有横风，减速并双手握紧方向盘');
  }

  const gravel = input.gravelKm ?? (/碎石|gravel/.test(blob) ? 8 : 0);
  if (gravel > 0) {
    notes.push(`含 ${Math.round(gravel)} km 左右碎石路，注意车速与胎压`);
  } else {
    notes.push('碎石路占比很低或无显著碎石段');
  }

  if (input.plowServiceBand && input.plowServiceBand !== 'DAILY') {
    notes.push(`清雪服务：${input.plowServiceBand}`);
  }
  if (input.plowDelayRangeMin) {
    notes.push(
      `清雪相关延误参考：${input.plowDelayRangeMin[0]}-${input.plowDelayRangeMin[1]} 分钟`,
    );
  }
  if (input.alertDetail && !notes.some((n) => n.includes(input.alertDetail!.slice(0, 12)))) {
    notes.push(input.alertDetail.slice(0, 120));
  }
  return notes.slice(0, 6);
}

type RankedParking = {
  id: string;
  nameZh: string;
  distanceKm: number;
  lat: number;
  lng: number;
  source: 'PLACE' | 'PACK';
};

function rankPlaceParking(
  origin: { lat: number; lng: number },
  rows: PlaceParkingRow[],
  maxKm = 220,
): RankedParking[] {
  const out: RankedParking[] = [];
  for (const row of rows) {
    const distanceKm = haversineKm(origin.lat, origin.lng, row.lat, row.lng);
    if (distanceKm > maxKm) continue;
    out.push({
      id: `place:${row.id}`,
      nameZh: (row.nameCN || row.nameEN || `停车场 ${row.id}`).trim(),
      distanceKm,
      lat: row.lat,
      lng: row.lng,
      source: 'PLACE',
    });
  }
  out.sort((a, b) => a.distanceKm - b.distanceKm);
  return out;
}

function rankSafeStops(
  origin: { lat: number; lng: number },
  maxKm = 220,
): RankedParking[] {
  const catalog = loadIcelandSafeStopCatalog();
  const ranked: RankedParking[] = [];
  for (const stop of catalog.stops) {
    const distanceKm = haversineKm(origin.lat, origin.lng, stop.lat, stop.lng);
    if (distanceKm > maxKm) continue;
    ranked.push({
      id: stop.poiId,
      nameZh: stop.name,
      distanceKm,
      lat: stop.lat,
      lng: stop.lng,
      source: 'PACK',
    });
  }
  ranked.sort((a, b) => a.distanceKm - b.distanceKm);
  return ranked;
}

function buildParkingSpots(input: RoadDetailProjectionInput): DailyDriveRoadParkingSpot[] {
  const items = input.items ?? [];
  const origin =
    input.originLat != null && input.originLng != null
      ? { lat: input.originLat, lng: input.originLng }
      : items.find((i) => i.lat != null && i.lng != null);

  if (!origin || origin.lat == null || origin.lng == null) return [];

  const fromPlace = rankPlaceParking(
    { lat: origin.lat, lng: origin.lng },
    input.placeParking ?? [],
  );
  const fromPack = rankSafeStops({ lat: origin.lat, lng: origin.lng });

  // Place 优先；不足再用 pack 补齐到 2
  const merged: RankedParking[] = [];
  const seen = new Set<string>();
  for (const hit of [...fromPlace, ...fromPack]) {
    if (hit.distanceKm < 1.5) continue; // 跳过几乎就在脚下的点
    const key = `${hit.lat.toFixed(3)},${hit.lng.toFixed(3)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(hit);
    if (merged.length >= 2) break;
  }

  return merged.map((h, idx) => {
    const distanceKm = Math.round(h.distanceKm);
    const durationMin = Math.max(
      5,
      Math.round((distanceKm / AVG_DRIVE_KMH) * 60),
    );
    const role: DailyDriveRoadParkingSpot['role'] = idx === 0 ? 'NEXT' : 'ALTERNATE';
    return {
      id: h.id,
      role,
      roleZh: role === 'NEXT' ? '下一安全停车点' : '备选停车点',
      nameZh: h.nameZh,
      distanceKm,
      distanceZh: `${distanceKm} km`,
      durationZh: formatDurationZh(durationMin),
      detailZh: `${distanceKm} km · ${formatDurationZh(durationMin)}`,
      lat: h.lat,
      lng: h.lng,
    };
  });
}

export function projectRoadDetailRich(
  ctx: RoadDetailContext,
  input: RoadDetailProjectionInput & { routeSummaryZh?: string },
): DailyDriveRoadDetailDto {
  let severity = mapStatusToDetailSeverity(ctx.summaryStatus);
  const items = input.items ?? [];
  const nodes =
    input.routeNodesZh?.length
      ? input.routeNodesZh
      : items.map((i) => i.title).filter(Boolean);

  const routeNodesZh =
    nodes.length >= 2
      ? nodes.slice(0, 6).map(shortNodeName)
      : ['今日起点', '途经路段', '今日终点'];

  const { totalKm, progressKm } = computeDistances(items);
  const totalDisplay = totalKm > 0 ? totalKm : 196;
  const progressDisplay =
    progressKm > 0 ? progressKm : Math.min(Math.round(totalDisplay * 0.3), totalDisplay);

  // arrival: last item time ± 10, or provided
  let arrivalWindowZh = input.arrivalWindowZh;
  if (!arrivalWindowZh) {
    const last = [...items].reverse().find((i) => i.time);
    if (last?.time) {
      const m = /^(\d{1,2}):(\d{2})$/.exec(last.time);
      if (m) {
        const mins = Number(m[1]) * 60 + Number(m[2]);
        const fmt = (n: number) => {
          const d = ((n % 1440) + 1440) % 1440;
          return `${String(Math.floor(d / 60)).padStart(2, '0')}:${String(d % 60).padStart(2, '0')}`;
        };
        arrivalWindowZh = `${fmt(mins - 10)}-${fmt(mins + 10)}`;
      }
    }
  }

  const stats: DailyDriveRoadStatRow[] = [
    { id: 'TOTAL_KM', labelZh: '总里程', valueZh: `${totalDisplay} km` },
    { id: 'PROGRESS_KM', labelZh: '当前进度', valueZh: `${progressDisplay} km` },
    {
      id: 'ARRIVAL_WINDOW',
      labelZh: '预计到达',
      valueZh: arrivalWindowZh ?? '待评估',
    },
  ];

  const crosswind =
    input.crosswind ??
    /横风|侧风|cross.?wind|wind|阵风/i.test(
      `${input.alertDetail ?? ''} ${input.alertTitle ?? ''} ${(input.envEvents ?? []).map((e) => e.description).join(' ')}`,
    );
  const segments = buildSegments(routeNodesZh, items, severity, {
    ...input,
    crosswind,
  });

  if (crosswind && severity === 'OK') severity = 'ATTENTION';

  const routeSummaryZh = inferRouteSummaryZh({ ...input, crosswind });
  const nextChangeInMin = input.nextChangeInMin ?? (severity === 'OK' ? 45 : 20);
  const nextChangeLabelZh = `预计下一次明显路况变化：${nextChangeInMin} 分钟后`;

  const riskNotesZh = buildRiskNotes({ ...input, crosswind }, severity);
  const parkingSpots = buildParkingSpots(input);

  return {
    schemaId: DAILY_DRIVE_DIMENSION_SCHEMA_IDS.ROAD,
    localDate: ctx.localDate,
    timezone: ctx.timezone,
    contextVersion: ctx.contextVersion,
    context: {
      tripLabelZh: ctx.tripLabelZh,
      dayLabelZh: ctx.dayLabelZh,
    },
    hero: {
      titleZh: heroTitle(severity),
      detailZh: routeSummaryZh,
      metaZh: nextChangeLabelZh,
      severity,
      iconHint: 'road.lanes',
    },
    primaryAction: { labelZh: '打开地图', action: 'OPEN_MAP' },
    routeSummaryZh,
    nextChangeInMin,
    nextChangeLabelZh,
    routeNodesZh,
    stats,
    segments,
    riskNotesZh,
    parkingSpots,
    changeNoteZh: RUNBOOK_POLICY_ZH,
  };
}
