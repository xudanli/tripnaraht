import { haversineKm } from '../../trips/attraction-explore/utils/attraction-explore-place-coordinates.util';
import {
  CONFIRMED_BOOKING_STATUSES,
  PENDING_BOOKING_STATUSES,
} from '../../trips/utils/timeline-overview.util';
import type {
  MobileRouteBlueprintDto,
  MobileRouteBlueprintOverviewSummaryDto,
  RouteBlueprintConfirmationStatus,
  RouteBlueprintDayDto,
  RouteBlueprintDayStatus,
  RouteBlueprintPaceDto,
} from '../dto/mobile-planning.types';

export type RouteBlueprintCoords = { lat: number; lng: number };

export type RouteBlueprintStopFact = {
  itemId: string;
  title: string;
  type?: string | null;
  category?: string | null;
  bookingStatus?: string | null;
  coords: RouteBlueprintCoords | null;
  cityName?: string | null;
  isCoreAttraction: boolean;
  isAccommodation: boolean;
};

export type RouteBlueprintDayFact = {
  id: string;
  dayNumber: number;
  /** Region short label (e.g. 南岸 / 黄金圈) */
  label?: string | null;
  /** Narrative theme (e.g. 瀑布与黑沙滩) */
  theme?: string | null;
  stops: RouteBlueprintStopFact[];
};

export type ProjectRouteBlueprintInput = {
  tripName: string;
  destinationLabel: string;
  nightCount?: number;
  days: RouteBlueprintDayFact[];
  /** 1-based focus day for timeline "current" (defaults to first non-confirmed) */
  focusDayNumber?: number;
  contextVersion: number;
  planVersion?: number;
};

/** Iceland road factor: straight-line → approximate driving km */
const ROAD_FACTOR = 1.35;
const HIGH_INTENSITY_KM = 250;

function formatKmLabel(km: number): string {
  if (!Number.isFinite(km) || km <= 0) return '—';
  const rounded = Math.round(km);
  return `~${rounded.toLocaleString('en-US')} km`;
}

function intensityForTotalKm(km: number, dayCount: number): string {
  if (!Number.isFinite(km) || dayCount <= 0) return '未知';
  const perDay = km / dayCount;
  if (perDay < 120) return '轻松';
  if (perDay < 220) return '适中';
  return '偏紧';
}

function intensityForChanges(count: number, nightCount: number): string {
  if (nightCount <= 0) return '未知';
  const ratio = count / nightCount;
  if (ratio <= 0.4) return '少';
  if (ratio <= 0.75) return '适中';
  return '频繁';
}

function normalizeConfirmationAlias(
  raw: string | null | undefined,
): RouteBlueprintConfirmationStatus | null {
  if (!raw) return null;
  const u = raw.trim().toUpperCase();
  if (u === 'CONFIRMED' || u === 'COMPLETED' || u === 'DONE' || u === 'BOOKED') {
    return 'CONFIRMED';
  }
  if (
    u === 'NEEDS_OPTIMIZATION' ||
    u === 'OPTIMIZE' ||
    u === 'WARNING' ||
    u === 'NEED_OPTIMIZATION'
  ) {
    return 'NEEDS_OPTIMIZATION';
  }
  if (u === 'PENDING' || u === 'NEED_BOOKING' || u === 'UNBOOKED') {
    return 'PENDING';
  }
  return null;
}

export function resolveRouteBlueprintSystemImage(
  category?: string | null,
  theme?: string | null,
): string {
  const hay = `${category ?? ''} ${theme ?? ''}`.toLowerCase();
  if (/waterfall|瀑布|drop/.test(hay)) return 'drop.fill';
  if (/beach|黑沙|海岸|coast/.test(hay)) return 'beach.umbrella';
  if (/lagoon|温泉|hot.?spring|蓝湖/.test(hay)) return 'humidity.fill';
  if (/glacier|冰川|ice/.test(hay)) return 'snowflake';
  if (/hike|trail|徒步|highland|高地/.test(hay)) return 'figure.hiking';
  if (/reykjavik|雷克雅未克|city|都市/.test(hay)) return 'building.2.fill';
  if (/黄金圈|golden/.test(hay)) return 'circle.hexagongrid.fill';
  return 'map.fill';
}

export function dayDrivingKm(stops: RouteBlueprintStopFact[]): number {
  const pts = stops
    .map((s) => s.coords)
    .filter((c): c is RouteBlueprintCoords => Boolean(c));
  if (pts.length < 2) return 0;
  let sum = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    sum += haversineKm(pts[i].lat, pts[i].lng, pts[i + 1].lat, pts[i + 1].lng);
  }
  return sum * ROAD_FACTOR;
}

function overnightHopKm(
  from: RouteBlueprintDayFact | undefined,
  to: RouteBlueprintDayFact | undefined,
): number {
  if (!from || !to) return 0;
  const a =
    [...from.stops].reverse().find((s) => s.coords)?.coords ??
    from.stops.find((s) => s.coords)?.coords;
  const b = to.stops.find((s) => s.coords)?.coords;
  if (!a || !b) return 0;
  return haversineKm(a.lat, a.lng, b.lat, b.lng) * ROAD_FACTOR;
}

export function resolveDayConfirmationStatus(
  day: RouteBlueprintDayFact,
  dayKm: number,
): RouteBlueprintConfirmationStatus {
  const core = day.stops.filter((s) => s.isCoreAttraction);
  if (core.length === 0 && day.stops.length === 0) return 'PENDING';

  const bookings = day.stops
    .map((s) => s.bookingStatus)
    .filter((b): b is string => Boolean(b));

  const anyPending = bookings.some(
    (b) => PENDING_BOOKING_STATUSES.has(b.toUpperCase()) || normalizeConfirmationAlias(b) === 'PENDING',
  );
  const allConfirmed =
    bookings.length > 0 &&
    bookings.every(
      (b) =>
        CONFIRMED_BOOKING_STATUSES.has(b.toUpperCase()) ||
        normalizeConfirmationAlias(b) === 'CONFIRMED',
    );

  if (dayKm >= HIGH_INTENSITY_KM) return 'NEEDS_OPTIMIZATION';
  if (core.length === 0) return 'PENDING';
  if (anyPending) return 'PENDING';
  if (allConfirmed) return 'CONFIRMED';
  // Active Plan has core stops and no pending booking flags
  return 'CONFIRMED';
}

function resolveTimelineStatuses(
  days: RouteBlueprintDayFact[],
  confirmations: RouteBlueprintConfirmationStatus[],
  focusDayNumber?: number,
): RouteBlueprintDayStatus[] {
  const n = days.length;
  if (n === 0) return [];

  let currentIdx = 0;
  if (focusDayNumber != null && Number.isFinite(focusDayNumber)) {
    const found = days.findIndex((d) => d.dayNumber === focusDayNumber);
    if (found >= 0) currentIdx = found;
  } else {
    const firstOpen = confirmations.findIndex((c) => c !== 'CONFIRMED');
    currentIdx = firstOpen >= 0 ? firstOpen : Math.max(0, n - 1);
  }

  return days.map((_, i) => {
    if (i < currentIdx) return 'completed';
    if (i === currentIdx) return 'current';
    if (i === currentIdx + 1) return 'upcoming';
    return 'future';
  });
}

function pickAccommodationCity(day: RouteBlueprintDayFact): string | undefined {
  const hotel = day.stops.find((s) => s.isAccommodation && s.cityName?.trim());
  if (hotel?.cityName?.trim()) return hotel.cityName.trim();
  const anyCity = day.stops.find((s) => s.cityName?.trim());
  return anyCity?.cityName?.trim() || undefined;
}

function pickCoreAttractions(day: RouteBlueprintDayFact): string[] {
  const names = day.stops
    .filter((s) => s.isCoreAttraction)
    .map((s) => s.title.trim())
    .filter(Boolean);
  const unique: string[] = [];
  for (const name of names) {
    if (!unique.includes(name)) unique.push(name);
    if (unique.length >= 4) break;
  }
  return unique;
}

function buildTheme(day: RouteBlueprintDayFact, core: string[]): string {
  const theme = day.theme?.trim();
  if (theme) return theme;
  if (core.length >= 2) return `${core[0]}与${core[1]}`;
  if (core.length === 1) return core[0];
  return day.label?.trim() || `Day ${day.dayNumber}`;
}

function buildLabel(day: RouteBlueprintDayFact, theme: string): string {
  const label = day.label?.trim();
  if (label) return label;
  // Prefer short region-ish first token of theme
  const short = theme.split(/[·・/\s与和]/)[0]?.trim();
  return short || `Day ${day.dayNumber}`;
}

function buildSubtitle(theme: string, core: string[], dayNumber: number): string {
  if (dayNumber === 1 && /抵达|airport|落地|arrival/i.test(theme)) return '抵达';
  if (core.length > 0) return theme;
  return theme || '待安排';
}

function countAccommodationChanges(days: RouteBlueprintDayFact[]): number {
  const cities = days.map((d) => pickAccommodationCity(d) ?? null);
  let changes = 0;
  let prev: string | null = null;
  for (const city of cities) {
    if (!city) continue;
    if (prev && prev !== city) changes += 1;
    prev = city;
  }
  return changes;
}

function buildPace(days: RouteBlueprintDayFact[]): RouteBlueprintPaceDto {
  const perDayKm = days.map((day, i) => {
    const within = dayDrivingKm(day.stops);
    const hop = overnightHopKm(days[i], days[i + 1]);
    // Attribute overnight hop to the departure day for "longest day" readability
    return within + hop;
  });

  const totalDrivingKm = perDayKm.reduce((s, v) => s + v, 0);
  let longestDayIndex = 1;
  let longestDayDrivingKm = 0;
  for (let i = 0; i < perDayKm.length; i++) {
    if (perDayKm[i] > longestDayDrivingKm) {
      longestDayDrivingKm = perDayKm[i];
      longestDayIndex = days[i]?.dayNumber ?? i + 1;
    }
  }

  const highIntensityDayIndexes = days
    .filter((_, i) => perDayKm[i] >= HIGH_INTENSITY_KM)
    .map((d) => d.dayNumber);
  const accommodationChangeCount = countAccommodationChanges(days);
  const nightCount = Math.max(days.length - 1, 0);

  return {
    totalDrivingKm: Number.isFinite(totalDrivingKm) ? Math.round(totalDrivingKm) : undefined,
    totalDrivingLabel: formatKmLabel(totalDrivingKm),
    totalDrivingIntensity: intensityForTotalKm(totalDrivingKm, days.length),
    longestDayDrivingKm: Number.isFinite(longestDayDrivingKm)
      ? Math.round(longestDayDrivingKm)
      : undefined,
    longestDayDrivingLabel: formatKmLabel(longestDayDrivingKm),
    longestDayIndex: days.length > 0 ? longestDayIndex : undefined,
    accommodationChangeCount,
    accommodationChangeLabel: `${accommodationChangeCount} 次`,
    accommodationChangeIntensity: intensityForChanges(accommodationChangeCount, nightCount || 1),
    highIntensityDayCount: highIntensityDayIndexes.length,
    highIntensityDayLabel: `${highIntensityDayIndexes.length} 天`,
    highIntensityDayIndexes,
  };
}

function buildAiInsight(
  pace: RouteBlueprintPaceDto,
  confirmations: RouteBlueprintConfirmationStatus[],
  days: RouteBlueprintDayFact[],
): { aiInsight?: string; aiInsightTargetDays?: number[] } {
  if (pace.highIntensityDayIndexes.length >= 2) {
    const idxs = pace.highIntensityDayIndexes.slice(0, 3);
    const labels = idxs.map((n) => `Day${n}`).join(' 与 ');
    return {
      aiInsight: `${labels} 空间节奏偏紧，建议拆宿或缩短当日行程点`,
      aiInsightTargetDays: idxs,
    };
  }
  if (pace.highIntensityDayIndexes.length === 1) {
    const n = pace.highIntensityDayIndexes[0];
    return {
      aiInsight: `Day${n} 驾驶距离偏长（${pace.longestDayDrivingLabel}），可评估是否前移过夜点`,
      aiInsightTargetDays: [n],
    };
  }
  const pendingIdx = confirmations
    .map((c, i) => (c === 'PENDING' || c === 'NEEDS_OPTIMIZATION' ? days[i]?.dayNumber : null))
    .filter((n): n is number => n != null)
    .slice(0, 3);
  if (pendingIdx.length > 0) {
    return {
      aiInsight: `Day${pendingIdx.join('/')} 计划确认度仍不足，可先补齐核心景点与住宿`,
      aiInsightTargetDays: pendingIdx,
    };
  }
  if (days.length > 0) {
    return {
      aiInsight: `全程约 ${pace.totalDrivingLabel}，节奏${pace.totalDrivingIntensity ?? '适中'}`,
      aiInsightTargetDays: [],
    };
  }
  return {};
}

function structureName(destinationLabel: string, tripName: string): string {
  const hay = `${destinationLabel} ${tripName}`.toLowerCase();
  if (/环岛|ring.?road/.test(hay)) return '冰岛环岛结构';
  if (/南岸|south.?coast/.test(hay)) return '南岸结构';
  if (/黄金圈|golden.?circle/.test(hay)) return '黄金圈结构';
  if (/冰岛|iceland|is\b/.test(hay)) return '冰岛行程结构';
  return destinationLabel?.trim() || tripName?.trim() || '行程结构';
}

/**
 * Project planning route-blueprint read model (day structure, not map geometry).
 */
export function projectRouteBlueprint(
  input: ProjectRouteBlueprintInput,
): MobileRouteBlueprintDto {
  const days = input.days;
  const dayCount = days.length;
  const nightCount =
    input.nightCount != null && Number.isFinite(input.nightCount)
      ? Math.max(0, Math.floor(input.nightCount))
      : Math.max(0, dayCount - 1);

  const perDayKm = days.map((d) => dayDrivingKm(d.stops));
  const confirmations = days.map((d, i) => resolveDayConfirmationStatus(d, perDayKm[i]));
  const timeline = resolveTimelineStatuses(days, confirmations, input.focusDayNumber);

  const projectedDays: RouteBlueprintDayDto[] = days.map((day, i) => {
    const coreAttractions = pickCoreAttractions(day);
    const theme = buildTheme(day, coreAttractions);
    const label = buildLabel(day, theme);
    const accommodationCity = pickAccommodationCity(day);
    return {
      id: day.id || `day-${day.dayNumber}`,
      dayNumber: day.dayNumber,
      label,
      subtitle: buildSubtitle(theme, coreAttractions, day.dayNumber),
      status: timeline[i] ?? 'future',
      theme,
      coreAttractions,
      accommodationCity,
      confirmationStatus: confirmations[i] ?? 'PENDING',
      systemImage: resolveRouteBlueprintSystemImage(
        day.stops.find((s) => s.isCoreAttraction)?.category,
        theme,
      ),
    };
  });

  const pace = buildPace(days);
  const insight = buildAiInsight(pace, confirmations, days);
  const struct = structureName(input.destinationLabel, input.tripName);
  const title = /环岛|ring/i.test(struct) ? '环岛路线蓝图' : '路线蓝图';

  return {
    title,
    summary: `${dayCount}天${nightCount}晚 · ${struct}`,
    days: projectedDays,
    pace,
    ...insight,
    contextVersion: input.contextVersion,
    planVersion: input.planVersion,
  };
}

export function projectRouteBlueprintOverviewSummary(
  full: MobileRouteBlueprintDto,
): MobileRouteBlueprintOverviewSummaryDto {
  return {
    title: full.title,
    summary: full.summary,
    days: full.days.map((d) => ({
      id: d.id,
      dayNumber: d.dayNumber,
      label: d.label,
      subtitle: d.subtitle,
      status: d.status,
    })),
  };
}

/** Classify itinerary item as core attraction / accommodation for blueprint. */
export function classifyBlueprintStop(input: {
  type?: string | null;
  category?: string | null;
  costCategory?: string | null;
  name?: string | null;
}): { isCoreAttraction: boolean; isAccommodation: boolean } {
  const type = (input.type ?? '').toUpperCase();
  const category = (input.category ?? '').toUpperCase();
  const cost = (input.costCategory ?? '').toUpperCase();
  const name = (input.name ?? '').toLowerCase();

  const isAccommodation =
    cost === 'ACCOMMODATION' ||
    category === 'HOTEL' ||
    type === 'REST' ||
    /hotel|hostel|lodging|guesthouse|住宿|酒店|旅馆/.test(name);

  if (isAccommodation) {
    return { isCoreAttraction: false, isAccommodation: true };
  }

  const isMeal = type === 'MEAL_ANCHOR' || type === 'MEAL_FLOATING' || category === 'RESTAURANT';
  const isTransit = type === 'TRANSIT' || category === 'TRANSIT_HUB';
  if (isMeal || isTransit) {
    return { isCoreAttraction: false, isAccommodation: false };
  }

  const isCoreAttraction =
    type === 'ACTIVITY' ||
    category === 'ATTRACTION' ||
    /waterfall|beach|museum|park|lagoon|glacier|viewpoint|瀑布|沙滩|冰川|公园/.test(
      `${category} ${name}`.toLowerCase(),
    ) ||
    Boolean(input.name?.trim());

  return { isCoreAttraction: Boolean(isCoreAttraction && input.name?.trim()), isAccommodation: false };
}
