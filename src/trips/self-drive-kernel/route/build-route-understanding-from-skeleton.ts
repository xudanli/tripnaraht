/**
 * Route Understanding（K1 最小实现）：
 * Corridor（经典线）→ 当日 stops → CriticalRoadSegment[]
 */
import type {
  CriticalRoadSegment,
  CriticalSegmentReason,
  RouteUnderstandingSnapshot,
} from '../contracts/self-drive-context.types';
import {
  pickClassicDaySkeletonVariant,
  type ClassicDayStop,
} from './load-classic-day-skeleton';

const LONG_DAY_KM = 350;

function slugPart(label: string): string {
  return label
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9\u4e00-\u9fff-]/g, '')
    .slice(0, 32);
}

function detectCriticalReasons(input: {
  stop: ClassicDayStop;
  countryCode: string;
  corridorId: string;
  warnSegmentDistanceKm?: number;
  routeSeverityHigh?: boolean;
  wantsAltitude?: boolean;
  checkpointLikely?: boolean;
}): CriticalSegmentReason[] {
  const reasons: CriticalSegmentReason[] = [];
  const notes = `${input.stop.notesCN ?? ''} ${(input.stop.highlights ?? []).join(' ')}`;
  const km = input.stop.driveKmHint;
  const warnAt = input.warnSegmentDistanceKm ?? LONG_DAY_KM;

  if (km != null && km >= warnAt) reasons.push('LONG_DAY');

  if (
    input.wantsAltitude ||
    /高反|海拔|垭口|高原|盘山|川西|涉藏/i.test(notes)
  ) {
    reasons.push('ALTITUDE');
  }

  if (/雨季|季节|封路|开放季|冬季|雪|独库.*未开通/i.test(notes)) {
    reasons.push('SEASONAL');
  }

  if (
    input.countryCode === 'IS' &&
    (/f-?road|f\d{2,3}|highland|高地|涉水|ford/i.test(notes) ||
      /highland|froad|central/i.test(input.corridorId))
  ) {
    if (/涉水|ford|river/i.test(notes)) reasons.push('FORD');
    reasons.push('F_ROAD');
  }

  if (input.checkpointLikely || /检查站|边防|通行证/i.test(notes)) {
    reasons.push('CHECKPOINT');
    reasons.push('RESTRICTED_AREA');
  }

  if (/塌方|落石|强风|测速|危险|勿恋战|最长驾驶/i.test(notes)) {
    reasons.push('NOTES_HAZARD');
  }

  if (input.routeSeverityHigh) {
    reasons.push('HIGH_SEVERITY_ROUTE');
  }

  return [...new Set(reasons)];
}

function resolveIsProfileRef(
  corridorId: string,
  reasons: CriticalSegmentReason[],
): CriticalRoadSegment['profileRef'] | undefined {
  if (!reasons.includes('F_ROAD') && !/highland|froad/i.test(corridorId)) {
    if (/ring_road/i.test(corridorId)) {
      return { roadId: 'RING_ROAD', segmentId: 'seg-is-ring-road' };
    }
    return undefined;
  }
  if (/f208|sprengisandur/i.test(corridorId)) {
    return { roadId: 'F208', segmentId: 'seg-is-f208' };
  }
  if (/f26/i.test(corridorId)) {
    return { roadId: 'F26', segmentId: 'seg-is-f26' };
  }
  return { roadId: 'F208', segmentId: 'seg-is-f208' };
}

export function buildRouteUnderstandingFromSkeleton(input: {
  countryCode: string;
  corridorId: string | null;
  corridorNameZh?: string | null;
  dayIndex: number;
  preferredDays?: number | null;
  warnSegmentDistanceKm?: number;
  routeSeverityHigh?: boolean;
  wantsAltitude?: boolean;
  checkpointLikely?: boolean;
}): RouteUnderstandingSnapshot {
  const dayIndex = Math.max(1, Math.floor(input.dayIndex || 1));
  const empty: RouteUnderstandingSnapshot = {
    corridorId: input.corridorId,
    corridorNameZh: input.corridorNameZh ?? null,
    variantId: null,
    dayIndex,
    originLabel: null,
    destinationLabel: null,
    segments: [],
    criticalSegments: [],
  };

  if (!input.corridorId) return empty;

  const variant = pickClassicDaySkeletonVariant({
    countryCode: input.countryCode,
    corridorId: input.corridorId,
    preferredDays: input.preferredDays,
  });
  if (!variant) return empty;

  const dayStops = variant.stops.filter((s) => s.day === dayIndex);
  const stops = dayStops.length
    ? dayStops
    : variant.stops.filter((s) => s.day === variant.stops[0]?.day);

  const cc = input.countryCode.trim().toUpperCase();
  const segments: CriticalRoadSegment[] = stops.map((stop, idx) => {
    const reasons = detectCriticalReasons({
      stop,
      countryCode: cc,
      corridorId: input.corridorId!,
      warnSegmentDistanceKm: input.warnSegmentDistanceKm,
      routeSeverityHigh: input.routeSeverityHigh,
      wantsAltitude: input.wantsAltitude,
      checkpointLikely: input.checkpointLikely,
    });
    const isCritical = reasons.length > 0;
    const segmentId = `seg:${input.corridorId}:d${stop.day}:${slugPart(stop.from)}-${slugPart(stop.to)}-${idx}`;

    return {
      segmentId,
      corridorId: input.corridorId,
      dayIndex: stop.day,
      fromLabel: stop.from,
      toLabel: stop.to,
      distanceKmHint: stop.driveKmHint,
      isCritical,
      criticalReasons: reasons,
      profileRef:
        cc === 'IS' || cc === 'ICELAND'
          ? resolveIsProfileRef(input.corridorId!, reasons)
          : undefined,
      notesZh: stop.notesCN,
    };
  });

  const first = segments[0];
  const last = segments[segments.length - 1];

  return {
    corridorId: input.corridorId,
    corridorNameZh: input.corridorNameZh ?? null,
    variantId: variant.id,
    dayIndex,
    originLabel: first?.fromLabel ?? null,
    destinationLabel: last?.toLabel ?? null,
    segments,
    criticalSegments: segments.filter((s) => s.isCritical),
  };
}
