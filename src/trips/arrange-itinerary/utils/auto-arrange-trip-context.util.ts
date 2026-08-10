/**
 * Auto-arrange 行程上下文：按 routeScope / 禁 F 路 / 已排地理邻域过滤并排序候选。
 * 纯函数为主，便于单测；不写库。
 */

import { ICELAND_REGION_PLANNING_PACKS } from '../../iceland-self-drive/packs/iceland-region-planning-packs';
import {
  packsForWizardRegion,
  listSolverAttractionPlaceIds,
} from '../../iceland-self-drive/packs/iceland-region-pack.registry';
import { resolvePlaceAccessFacts } from '../../iceland-self-drive/utils/iceland-place-access-facts.util';
import { haversineKm } from '../../attraction-explore/utils/attraction-explore-place-coordinates.util';
import type { PlaceCoordinates } from '../../../places/utils/place-coordinates.util';

export type AutoArrangeTripContext = {
  routeScope?: string;
  wizardRegionIds?: string[];
  excludeFRoad?: boolean;
  excludeHighlands?: boolean;
  dayThemes?: Record<string, string>;
};

export type AutoArrangeCandidateLike = {
  id: string;
  placeId: number;
  priority: string;
  sortOrder: number;
  nameCN?: string | null;
  nameEN?: string | null;
};

export type AutoArrangeDayAnchor = {
  dayNumber: number; // 1-based
  date: Date;
  centroid: PlaceCoordinates | null;
  theme?: string;
  /** 已占用的结束小时（UTC 墙钟粗估），用于换日 */
  occupiedUntilHour: number;
};

const PRIORITY_RANK: Record<string, number> = {
  must_go: 0,
  very_interested: 1,
  alternative: 2,
};

/** routeScope → 冰岛 wizard regionIds */
export function wizardRegionIdsFromRouteScope(routeScope: string | undefined): string[] {
  const s = String(routeScope ?? '').trim().toUpperCase();
  if (!s) return [];
  if (s === 'SOUTH_COAST_FOCUS') return ['south_coast', 'golden_circle', 'reykjanes'];
  if (s === 'SOUTH_PLUS_WEST_SPUR') {
    return ['south_coast', 'golden_circle', 'reykjanes', 'snaefellsnes'];
  }
  if (s === 'RING_COMPRESSED' || s === 'RING_ROAD' || s === 'FULL_RING') {
    return []; // 环岛：不做硬区域裁剪
  }
  return [];
}

export function resolveAutoArrangeRegionIds(ctx: AutoArrangeTripContext): string[] {
  const fromWizard = (ctx.wizardRegionIds ?? []).map((x) => String(x).trim()).filter(Boolean);
  if (fromWizard.length > 0) return [...new Set(fromWizard)];
  return wizardRegionIdsFromRouteScope(ctx.routeScope);
}

export function buildAllowedPlaceIdSet(regionIds: string[]): Set<number> | null {
  if (!regionIds.length) return null;
  const ids = new Set<number>();
  for (const rid of regionIds) {
    for (const pack of packsForWizardRegion(rid)) {
      for (const placeId of listSolverAttractionPlaceIds(pack)) ids.add(placeId);
      // 也纳入 TOWN_HUB / 有 placeId 的 PRIMARY 实体，避免漏掉核心锚点
      for (const e of pack.entities) {
        if (typeof e.placeId === 'number' && e.placeId > 0 && e.canonicalPlaceId == null) {
          if (
            e.entityType === 'ATTRACTION' ||
            e.entityType === 'ATTRACTION_AREA' ||
            e.entityType === 'TOWN_HUB' ||
            e.entityType === 'ROUTE_ANCHOR'
          ) {
            ids.add(e.placeId);
          }
        }
      }
    }
  }
  return ids.size > 0 ? ids : null;
}

/** Golden Set 中标注 f_road 的 placeId + highlands pack 全量 */
export function collectFroadOrHighlandsPlaceIds(): Set<number> {
  const ids = new Set<number>();
  for (const pack of ICELAND_REGION_PLANNING_PACKS) {
    const isHighlands = pack.packId === 'highlands' || pack.wizardRegionIds.includes('highlands');
    for (const e of pack.entities) {
      if (typeof e.placeId !== 'number' || e.placeId <= 0) continue;
      const vc = e.vehicleConstraints ?? [];
      if (isHighlands || vc.includes('f_road') || vc.includes('4wd_required')) {
        ids.add(e.placeId);
      }
      if (typeof e.parentPlaceId === 'number') {
        if (isHighlands || vc.includes('f_road')) ids.add(e.parentPlaceId);
      }
    }
  }
  return ids;
}

const HIGHLAND_NAME_RE =
  /高地|highland|landmannalaugar|兰德曼|thorsmork|þórsmörk|askja|阿斯基亚|kerlingarfjöll|sprengisandur|f[\s-]?road|f\d{2,3}|kverkfjöll/i;

export function isHighlandOrFroadCandidate(input: {
  placeId: number;
  nameCN?: string | null;
  nameEN?: string | null;
  froadPlaceIds?: Set<number>;
}): boolean {
  const facts = resolvePlaceAccessFacts(input.placeId);
  if (facts.requiresFroad || facts.requires4wd) return true;
  if (input.froadPlaceIds?.has(input.placeId)) return true;
  const blob = `${input.nameCN ?? ''} ${input.nameEN ?? ''}`;
  return HIGHLAND_NAME_RE.test(blob);
}

export function parseAutoArrangeTripContext(metadata: unknown): AutoArrangeTripContext {
  const meta =
    metadata && typeof metadata === 'object' ? (metadata as Record<string, unknown>) : {};
  const constraints =
    meta.constraints && typeof meta.constraints === 'object'
      ? (meta.constraints as Record<string, unknown>)
      : {};
  const iceland =
    meta.icelandSelfDrive && typeof meta.icelandSelfDrive === 'object'
      ? (meta.icelandSelfDrive as Record<string, unknown>)
      : {};
  const wizard =
    iceland.wizard && typeof iceland.wizard === 'object'
      ? (iceland.wizard as Record<string, unknown>)
      : {};
  const regionIds = Array.isArray(wizard.regionIds)
    ? wizard.regionIds.filter((x): x is string => typeof x === 'string')
    : [];
  const dayThemes =
    meta.dayThemes && typeof meta.dayThemes === 'object'
      ? (meta.dayThemes as Record<string, string>)
      : undefined;

  const routeScope =
    (typeof meta.routeScope === 'string' && meta.routeScope) ||
    (typeof constraints.routeScope === 'string' && constraints.routeScope) ||
    undefined;

  return {
    routeScope,
    wizardRegionIds: regionIds,
    excludeFRoad:
      constraints.excludeFRoad === true ||
      constraints.fRoadAllowed === false ||
      constraints.fRoadAllowed === 'false',
    excludeHighlands:
      constraints.excludeHighlands === true ||
      constraints.highlandsMode === 'TOUR_ONLY' ||
      constraints.highlandsMode === 'NONE',
    dayThemes,
  };
}

export type AutoArrangeFilterResult = {
  kept: AutoArrangeCandidateLike[];
  dropped: Array<{ placeId: number; label: string; reason: string }>;
};

/**
 * 硬过滤：禁 F 路/高地 + routeScope 允许区域；已在行程中的 place 也丢弃。
 */
export function filterAutoArrangeCandidates(input: {
  candidates: AutoArrangeCandidateLike[];
  ctx: AutoArrangeTripContext;
  alreadyScheduledPlaceIds?: Set<number>;
}): AutoArrangeFilterResult {
  const regionIds = resolveAutoArrangeRegionIds(input.ctx);
  const allowed = buildAllowedPlaceIdSet(regionIds);
  const froadIds =
    input.ctx.excludeFRoad || input.ctx.excludeHighlands
      ? collectFroadOrHighlandsPlaceIds()
      : undefined;
  const scheduled = input.alreadyScheduledPlaceIds ?? new Set<number>();

  const kept: AutoArrangeCandidateLike[] = [];
  const dropped: AutoArrangeFilterResult['dropped'] = [];

  for (const c of input.candidates) {
    const label = c.nameCN || c.nameEN || String(c.placeId);
    if (scheduled.has(c.placeId)) {
      dropped.push({ placeId: c.placeId, label, reason: 'already_on_itinerary' });
      continue;
    }
    if (
      (input.ctx.excludeFRoad || input.ctx.excludeHighlands) &&
      isHighlandOrFroadCandidate({
        placeId: c.placeId,
        nameCN: c.nameCN,
        nameEN: c.nameEN,
        froadPlaceIds: froadIds,
      })
    ) {
      dropped.push({ placeId: c.placeId, label, reason: 'froad_or_highlands_blocked' });
      continue;
    }
    if (allowed && !allowed.has(c.placeId)) {
      dropped.push({ placeId: c.placeId, label, reason: 'outside_route_scope' });
      continue;
    }
    kept.push(c);
  }

  kept.sort(
    (a, b) =>
      (PRIORITY_RANK[a.priority] ?? 9) - (PRIORITY_RANK[b.priority] ?? 9) ||
      a.sortOrder - b.sortOrder,
  );

  return { kept, dropped };
}

function themeFit(theme: string | undefined, nameCN: string, nameEN: string): number {
  if (!theme) return 0;
  const t = theme.toLowerCase();
  const blob = `${nameCN} ${nameEN}`.toLowerCase();
  if (/冰川|glacier|冰河/.test(t) && /冰川|glacier|冰河|jökull|jokull|skaftafell|svartifoss|斯瓦蒂/.test(blob)) {
    return 20;
  }
  if (/黄金圈|golden/.test(t) && /黄金|geyser|gullfoss|þingvellir|thingvellir|辛格|盖歇尔/.test(blob)) {
    return 20;
  }
  if (/瀑布|waterfall/.test(t) && /瀑布|foss|waterfall/.test(blob)) return 12;
  return 0;
}

/**
 * 将候选分配到各天：优先靠近当日行程质心，兼顾主题与 preferDay。
 */
export function assignAutoArrangeCandidatesToDays(input: {
  candidates: AutoArrangeCandidateLike[];
  days: AutoArrangeDayAnchor[];
  preferDayNumber?: number;
  eveningCapHour: number;
  morningStartHour: (dayDate: Date) => number;
  coordsByPlaceId: Map<number, PlaceCoordinates>;
  dwellMinutesByPlaceId: Map<number, number>;
}): Array<{
  candidate: AutoArrangeCandidateLike;
  dayNumber: number;
  startTime: string;
  endTime: string;
}> {
  const days = input.days.map((d) => ({
    ...d,
    nextHour: Math.max(d.occupiedUntilHour, input.morningStartHour(d.date)),
  }));
  if (days.length === 0) return [];

  const out: Array<{
    candidate: AutoArrangeCandidateLike;
    dayNumber: number;
    startTime: string;
    endTime: string;
  }> = [];

  for (const c of input.candidates) {
    const coords = input.coordsByPlaceId.get(c.placeId);
    const dwell = input.dwellMinutesByPlaceId.get(c.placeId) ?? 90;
    const blockHours = Math.max(1, Math.ceil(dwell / 60));

    let best: { day: (typeof days)[number]; score: number } | null = null;
    for (const day of days) {
      if (day.nextHour + blockHours > input.eveningCapHour && day.nextHour >= input.eveningCapHour) {
        continue;
      }
      // 若当天已满，跳过
      if (day.nextHour >= input.eveningCapHour) continue;

      let score = 0;
      if (input.preferDayNumber != null && day.dayNumber === input.preferDayNumber) score += 8;
      score += themeFit(day.theme, c.nameCN ?? '', c.nameEN ?? '');
      if (coords && day.centroid) {
        const km = haversineKm(coords.lat, coords.lng, day.centroid.lat, day.centroid.lng);
        score += Math.max(0, 40 - km); // 越近越好
      } else if (!day.centroid) {
        score += 5; // 空日稍优先接新段
      }
      // 轻微偏好更空的一天
      score += Math.max(0, 12 - day.nextHour) * 0.3;

      if (!best || score > best.score) best = { day, score };
    }

    // 全部当天已满：开新一天槽（从 prefer 或最早有空的一天换日逻辑）
    if (!best) {
      const fallback =
        days.find((d) => d.nextHour < input.eveningCapHour) ??
        days[Math.max(0, (input.preferDayNumber ?? 1) - 1)] ??
        days[0]!;
      best = { day: fallback, score: 0 };
      if (fallback.nextHour >= input.eveningCapHour) {
        fallback.nextHour = input.morningStartHour(fallback.date);
      }
    }

    const day = best.day;
    if (day.nextHour + blockHours > input.eveningCapHour && day.nextHour > input.morningStartHour(day.date)) {
      // 换到下一空档日
      const next =
        days.find((d) => d.dayNumber > day.dayNumber && d.nextHour < input.eveningCapHour) ??
        days.find((d) => d.nextHour < input.eveningCapHour);
      if (next) {
        best = { day: next, score: best.score };
      }
    }

    const target = best.day;
    if (target.nextHour >= input.eveningCapHour) {
      target.nextHour = input.morningStartHour(target.date);
    }
    const startH = target.nextHour;
    const endH = Math.min(startH + blockHours, 23);
    const startTime = `${String(startH).padStart(2, '0')}:00`;
    const endTime = `${String(endH).padStart(2, '0')}:00`;
    target.nextHour = endH;
    out.push({ candidate: c, dayNumber: target.dayNumber, startTime, endTime });
  }

  return out;
}

export function meanCentroid(points: PlaceCoordinates[]): PlaceCoordinates | null {
  if (!points.length) return null;
  const lat = points.reduce((s, p) => s + p.lat, 0) / points.length;
  const lng = points.reduce((s, p) => s + p.lng, 0) / points.length;
  return { lat, lng };
}
