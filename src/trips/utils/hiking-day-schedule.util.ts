import { parseHikingSegments } from './embedded-hiking-trip-metadata.util';

export type HikingDayCardKind = 'trail' | 'buffer';

export type HikingDayCard = {
  kind: HikingDayCardKind | null;
  trekDayIndex?: number;
  titleZh?: string;
  titleEn?: string;
  distanceKm?: number;
  ascentM?: number;
  suitable?: boolean;
  recommendation?: string;
  hikePlanId?: string;
  segmentId?: string;
  routeDirectionId?: number;
  routeDirectionName?: string;
  /** 前端主标题，如 Day 2 · Hrafntinnusker → Álftavatn */
  label?: string;
};

type TrailPlanSegmentRow = {
  day: number;
  titleZh: string;
  titleEn: string;
  distanceKm: number;
  ascentM: number;
  suitable?: boolean;
  recommendation?: string;
};

function formatDateOnly(value: Date | string): string {
  if (typeof value === 'string') return value.slice(0, 10);
  return value.toISOString().slice(0, 10);
}

function dayOffsetFromStart(startIso: string, dateIso: string): number {
  const start = new Date(`${startIso}T00:00:00.000Z`).getTime();
  const date = new Date(`${dateIso}T00:00:00.000Z`).getTime();
  return Math.round((date - start) / 86_400_000);
}

function readRouteDirectionName(metadata: unknown): string | undefined {
  if (!metadata || typeof metadata !== 'object') return undefined;
  const meta = metadata as Record<string, unknown>;
  if (typeof meta.routeDirectionName === 'string') return meta.routeDirectionName;
  const plan = meta.hardTrekTrailPlan;
  if (plan && typeof plan === 'object') {
    const name = (plan as { routeDirectionName?: string }).routeDirectionName;
    if (typeof name === 'string') return name;
  }
  return undefined;
}

function readTrailSegments(metadata: unknown): TrailPlanSegmentRow[] {
  if (!metadata || typeof metadata !== 'object') return [];
  const plan = (metadata as Record<string, unknown>).hardTrekTrailPlan;
  if (!plan || typeof plan !== 'object') return [];
  const segments = (plan as { segments?: unknown }).segments;
  if (!Array.isArray(segments)) return [];
  return segments.filter(
    (s): s is TrailPlanSegmentRow =>
      !!s &&
      typeof s === 'object' &&
      typeof (s as TrailPlanSegmentRow).day === 'number' &&
      typeof (s as TrailPlanSegmentRow).titleZh === 'string',
  );
}

/** 按 TripDay 日期将 hardTrekTrailPlan 逐日段映射为卡片（非徒步日为 buffer） */
export function buildHikingDayCardsForTrip(
  metadata: unknown,
  tripDays: Array<{ date: Date | string }>,
): HikingDayCard[] {
  const trailSegments = readTrailSegments(metadata);
  const hikingSegments = parseHikingSegments(metadata);
  const primary = hikingSegments[0];
  const trekStart = primary?.startDate;
  const routeDirectionName = readRouteDirectionName(metadata);

  if (!trekStart || trailSegments.length === 0) {
    return tripDays.map(() => ({ kind: null }));
  }

  return tripDays.map((day) => {
    const dateIso = formatDateOnly(day.date);
    const offset = dayOffsetFromStart(trekStart, dateIso);

    if (offset < 0 || offset >= trailSegments.length) {
      return { kind: 'buffer' as const, label: '休整 / 非徒步日' };
    }

    const seg = trailSegments[offset];
    return {
      kind: 'trail' as const,
      trekDayIndex: seg.day,
      titleZh: seg.titleZh,
      titleEn: seg.titleEn,
      distanceKm: seg.distanceKm,
      ascentM: seg.ascentM,
      suitable: seg.suitable,
      recommendation: seg.recommendation,
      hikePlanId: primary.hikePlanId,
      segmentId: primary.segmentId,
      routeDirectionId: primary.routeDirectionId,
      routeDirectionName,
      label: `Day ${seg.day} · ${seg.titleZh}`,
    };
  });
}

/** 徒步核心天数（hardTrekTrailPlan.segments.length） */
export function resolveTrekCoreDayCount(metadata: unknown): number {
  const n = readTrailSegments(metadata).length;
  return n > 0 ? n : 0;
}

export function readHikingTrailSegments(metadata: unknown): TrailPlanSegmentRow[] {
  return readTrailSegments(metadata);
}

export function addDaysIso(startIso: string, daysToAdd: number): string {
  const d = new Date(`${startIso}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + daysToAdd);
  return d.toISOString().slice(0, 10);
}
