import { BadRequestException } from '@nestjs/common';
import { deepMergeRecords } from '../../hiking-demo/utils/hiking-detail-override-merge.util';
import type { TripWorldState } from '../decision/world-model';

export type HikingProfile = 'none' | 'embedded' | 'primary';

export type HikingSegmentReadinessSnapshot = {
  level?: string;
  score?: number;
  evaluatedAt?: string;
};

export type HikingSegment = {
  segmentId: string;
  startDate: string;
  endDate: string;
  routeDirectionId: number;
  hikePlanId?: string;
  label?: string;
  readinessSnapshot?: HikingSegmentReadinessSnapshot;
};

const HIKING_PROFILES: HikingProfile[] = ['none', 'embedded', 'primary'];

export function getMaxHikingSegments(): number {
  const raw = process.env.TRIP_HIKING_SEGMENT_MAX;
  const n = raw ? parseInt(raw, 10) : 3;
  return Number.isFinite(n) && n > 0 ? n : 3;
}

export function isEmbeddedHikingSegmentsFlagEnabled(): boolean {
  return process.env.FEATURE_FLAG_EMBEDDED_HIKING_SEGMENTS === 'true';
}

export function isHikeStartReadinessRequired(): boolean {
  return process.env.FEATURE_FLAG_HIKE_START_READINESS_REQUIRED === 'true';
}

export function getTripMetadataMaxBytes(): number {
  const raw = process.env.TRIP_METADATA_MAX_BYTES;
  const n = raw ? parseInt(raw, 10) : 65536;
  return Number.isFinite(n) && n > 1024 ? n : 65536;
}

export function assertMetadataSizeLimit(metadata: Record<string, unknown>): void {
  const json = JSON.stringify(metadata);
  const max = getTripMetadataMaxBytes();
  if (json.length > max) {
    throw embeddedHikingBadRequest(
      'METADATA_TOO_LARGE',
      `metadata serialized size ${json.length} exceeds limit ${max} bytes`,
    );
  }
}

/** embedded 片段日期跨度（含首尾），用于 generate-plan durationDays */
export function computeEmbeddedSegmentDurationDays(segments: HikingSegment[]): number {
  if (!segments.length) return 0;
  let min = segments[0].startDate;
  let max = segments[0].endDate;
  for (const s of segments) {
    if (s.startDate < min) min = s.startDate;
    if (s.endDate > max) max = s.endDate;
  }
  const start = parseDateOnly(min);
  const end = parseDateOnly(max);
  if (!start || !end) return 0;
  return Math.max(1, Math.floor((end.getTime() - start.getTime()) / 86_400_000) + 1);
}

export type EmbeddedHikingWorldStateHint = {
  hikingProfile: 'embedded';
  segmentCount: number;
  effectiveDurationDays: number;
  segmentIds: string[];
  dateRange: { start: string; end: string };
};

/** 将 Trip.metadata 的 embedded 片段信息写入 generate-plan 世界状态 */
export function applyEmbeddedHikingToWorldState(
  state: TripWorldState,
  metadata: unknown,
): { applied: boolean; hint?: EmbeddedHikingWorldStateHint } {
  const profile = inferHikingProfile(metadata);
  if (profile !== 'embedded' || !state.context) {
    return { applied: false };
  }
  const segments = parseHikingSegments(metadata);
  if (!segments.length) return { applied: false };

  const effectiveDurationDays = computeEmbeddedSegmentDurationDays(segments);
  state.context.durationDays = effectiveDurationDays;

  let min = segments[0].startDate;
  let max = segments[0].endDate;
  for (const s of segments) {
    if (s.startDate < min) min = s.startDate;
    if (s.endDate > max) max = s.endDate;
  }

  const hint: EmbeddedHikingWorldStateHint = {
    hikingProfile: 'embedded',
    segmentCount: segments.length,
    effectiveDurationDays,
    segmentIds: segments.map((s) => s.segmentId),
    dateRange: { start: min, end: max },
  };

  state.signals.embeddedHiking = hint;

  return { applied: true, hint };
}

export type HikingPhase =
  | 'idle'
  | 'configure_segments'
  | 'link_plans'
  | 'prep'
  | 'on_trail'
  | 'wrap_up';

export function parseHikingProfile(metadata: unknown): HikingProfile | null {
  if (!metadata || typeof metadata !== 'object') return null;
  const p = (metadata as Record<string, unknown>).hikingProfile;
  if (p === 'none' || p === 'embedded' || p === 'primary') return p;
  return null;
}

/** REL2：无 hikingProfile 时，有 hardTrek / 徒步 tags 视为 primary，否则 none */
export function inferHikingProfile(metadata: unknown): HikingProfile {
  const explicit = parseHikingProfile(metadata);
  if (explicit) return explicit;
  if (!metadata || typeof metadata !== 'object') return 'none';
  const meta = metadata as Record<string, unknown>;
  if (meta.hardTrekTrailPlan) return 'primary';
  const tags = Array.isArray(meta.tags) ? (meta.tags as string[]) : [];
  const hikingTags = ['徒步', 'hiking', 'trek', 'trail', 'TREKKING'];
  if (tags.some((t) => hikingTags.some((m) => t.toLowerCase().includes(m.toLowerCase())))) {
    return 'primary';
  }
  return 'none';
}

export function parseHikingSegments(metadata: unknown): HikingSegment[] {
  if (!metadata || typeof metadata !== 'object') return [];
  const raw = (metadata as Record<string, unknown>).hikingSegments;
  if (!Array.isArray(raw)) return [];
  const out: HikingSegment[] = [];
  for (let i = 0; i < raw.length; i++) {
    try {
      out.push(normalizeSegment(raw[i], i));
    } catch {
      // skip invalid rows in read paths
    }
  }
  return out;
}

export function suggestHikingPhase(input: {
  hikingProfile: HikingProfile;
  segments: HikingSegment[];
  hikePlans: Array<{ id: string; status: string; tripId: string | null }>;
}): HikingPhase {
  const { hikingProfile, segments, hikePlans } = input;
  const active = hikePlans.filter((p) => p.status !== 'cancelled');

  if (hikingProfile === 'none') return 'idle';

  if (active.some((p) => p.status === 'in_progress')) return 'on_trail';

  if (
    active.length > 0 &&
    active.every((p) => p.status === 'completed')
  ) {
    return 'wrap_up';
  }

  if (hikingProfile === 'embedded') {
    if (segments.length === 0) return 'configure_segments';
    const linked = new Set(
      segments.map((s) => s.hikePlanId).filter((id): id is string => !!id),
    );
    const missingLink = segments.some((s) => !s.hikePlanId);
    const orphanPlan = segments.some(
      (s) => s.hikePlanId && !active.find((p) => p.id === s.hikePlanId),
    );
    if (missingLink || orphanPlan || linked.size < segments.length) {
      return 'link_plans';
    }
  }

  if (active.some((p) => p.status === 'prep' || p.status === 'draft')) {
    return 'prep';
  }

  if (hikingProfile === 'primary' && active.length === 0) {
    return 'link_plans';
  }

  return hikingProfile === 'embedded' ? 'configure_segments' : 'idle';
}

/** Top-level deep merge; hikingSegments replaces the whole array when present in patch. */
export function mergeTripMetadata(
  existing: Record<string, unknown>,
  patch: Record<string, unknown>,
): Record<string, unknown> {
  const { hikingSegments, ...rest } = patch;
  const merged = deepMergeRecords(existing, rest);
  if (hikingSegments !== undefined) {
    merged.hikingSegments = hikingSegments;
  }
  return merged;
}

export function embeddedHikingBadRequest(code: string, message: string): BadRequestException {
  return new BadRequestException({ message, errorCode: code });
}

function parseDateOnly(value: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!m) return null;
  const d = new Date(`${m[1]}-${m[2]}-${m[3]}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function assertDateInTripRange(
  label: string,
  dateStr: string,
  tripStart: Date,
  tripEnd: Date,
): void {
  const d = parseDateOnly(dateStr);
  if (!d) {
    throw embeddedHikingBadRequest(
      'SEGMENT_DATE_OUT_OF_RANGE',
      `${label} must be YYYY-MM-DD`,
    );
  }
  const start = new Date(tripStart);
  start.setUTCHours(0, 0, 0, 0);
  const end = new Date(tripEnd);
  end.setUTCHours(23, 59, 59, 999);
  if (d < start || d > end) {
    throw embeddedHikingBadRequest(
      'SEGMENT_DATE_OUT_OF_RANGE',
      `${label} must fall within trip startDate and endDate`,
    );
  }
}

function normalizeSegment(raw: unknown, index: number): HikingSegment {
  if (!raw || typeof raw !== 'object') {
    throw embeddedHikingBadRequest(
      'VALIDATION_ERROR',
      `hikingSegments[${index}] must be an object`,
    );
  }
  const s = raw as Record<string, unknown>;
  const segmentId = s.segmentId;
  const startDate = s.startDate;
  const endDate = s.endDate;
  const routeDirectionId = s.routeDirectionId;

  if (typeof segmentId !== 'string' || !segmentId.trim()) {
    throw embeddedHikingBadRequest(
      'VALIDATION_ERROR',
      `hikingSegments[${index}].segmentId is required`,
    );
  }
  if (typeof startDate !== 'string' || typeof endDate !== 'string') {
    throw embeddedHikingBadRequest(
      'VALIDATION_ERROR',
      `hikingSegments[${index}] requires startDate and endDate`,
    );
  }
  if (typeof routeDirectionId !== 'number' || !Number.isInteger(routeDirectionId)) {
    throw embeddedHikingBadRequest(
      'VALIDATION_ERROR',
      `hikingSegments[${index}].routeDirectionId must be an integer`,
    );
  }

  const segStart = parseDateOnly(startDate);
  const segEnd = parseDateOnly(endDate);
  if (!segStart || !segEnd || segStart > segEnd) {
    throw embeddedHikingBadRequest(
      'SEGMENT_DATE_OUT_OF_RANGE',
      `hikingSegments[${index}] endDate must be on or after startDate`,
    );
  }

  return {
    segmentId: segmentId.trim(),
    startDate: startDate.slice(0, 10),
    endDate: endDate.slice(0, 10),
    routeDirectionId,
    hikePlanId: typeof s.hikePlanId === 'string' ? s.hikePlanId : undefined,
    label: typeof s.label === 'string' ? s.label : undefined,
    readinessSnapshot:
      s.readinessSnapshot && typeof s.readinessSnapshot === 'object'
        ? (s.readinessSnapshot as HikingSegmentReadinessSnapshot)
        : undefined,
  };
}

export function validateHikingMetadataFields(
  metadata: Record<string, unknown>,
  tripBounds: { startDate: Date; endDate: Date },
): void {
  const profile = metadata.hikingProfile;
  if (profile !== undefined) {
    if (typeof profile !== 'string' || !HIKING_PROFILES.includes(profile as HikingProfile)) {
      throw embeddedHikingBadRequest(
        'VALIDATION_ERROR',
        `hikingProfile must be one of: ${HIKING_PROFILES.join(', ')}`,
      );
    }
  }

  if (metadata.hikingSegments === undefined) return;
  if (!Array.isArray(metadata.hikingSegments)) {
    throw embeddedHikingBadRequest(
      'VALIDATION_ERROR',
      'hikingSegments must be an array',
    );
  }

  const max = getMaxHikingSegments();
  if (metadata.hikingSegments.length > max) {
    throw embeddedHikingBadRequest(
      'TRIP_SEGMENT_LIMIT',
      `hikingSegments length must not exceed ${max}`,
    );
  }

  for (let i = 0; i < metadata.hikingSegments.length; i++) {
    const seg = normalizeSegment(metadata.hikingSegments[i], i);
    assertDateInTripRange(
      `hikingSegments[${i}].startDate`,
      seg.startDate,
      tripBounds.startDate,
      tripBounds.endDate,
    );
    assertDateInTripRange(
      `hikingSegments[${i}].endDate`,
      seg.endDate,
      tripBounds.startDate,
      tripBounds.endDate,
    );
  }
}

export async function validateHikingSegmentHikePlanRefs(
  tripId: string,
  metadata: Record<string, unknown>,
  prisma: {
    hikePlan: {
      findUnique: (args: {
        where: { id: string };
        select: { id: true; tripId: true };
      }) => Promise<{ id: string; tripId: string | null } | null>;
    };
  },
): Promise<void> {
  const segments = metadata.hikingSegments;
  if (!Array.isArray(segments)) return;

  for (let i = 0; i < segments.length; i++) {
    const raw = segments[i];
    if (!raw || typeof raw !== 'object') continue;
    const hikePlanId = (raw as Record<string, unknown>).hikePlanId;
    if (typeof hikePlanId !== 'string' || !hikePlanId.trim()) continue;

    const plan = await prisma.hikePlan.findUnique({
      where: { id: hikePlanId },
      select: { id: true, tripId: true },
    });
    if (!plan) {
      throw embeddedHikingBadRequest(
        'HIKE_PLAN_TRIP_MISMATCH',
        `hikingSegments[${i}].hikePlanId not found`,
      );
    }
    if (plan.tripId !== tripId) {
      throw embeddedHikingBadRequest(
        'HIKE_PLAN_TRIP_MISMATCH',
        `hike plan ${hikePlanId} is not linked to trip ${tripId}`,
      );
    }
  }
}

export function extractHttpErrorCode(exception: unknown): string | undefined {
  if (!(exception instanceof BadRequestException)) return undefined;
  const resp = exception.getResponse();
  if (typeof resp === 'object' && resp !== null && 'errorCode' in resp) {
    return String((resp as { errorCode: string }).errorCode);
  }
  return undefined;
}

export function extractHttpErrorMessage(exception: unknown): string {
  if (!(exception instanceof BadRequestException)) {
    return exception instanceof Error ? exception.message : 'Bad request';
  }
  const resp = exception.getResponse();
  if (typeof resp === 'string') return resp;
  if (typeof resp === 'object' && resp !== null && 'message' in resp) {
    const msg = (resp as { message: string | string[] }).message;
    return Array.isArray(msg) ? msg.join('; ') : String(msg);
  }
  return exception.message;
}
