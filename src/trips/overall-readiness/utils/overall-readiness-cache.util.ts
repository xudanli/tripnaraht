/**
 * 整体准备度缓存 — 供列表 BFF 轻量读取，避免 N 次全量重算
 */

import type {
  OverallReadinessSnapshot,
  OverallReadinessState,
} from '../types/overall-trip-readiness.types';

export const OVERALL_READINESS_CACHE_KEY = 'overallReadinessCache';

export interface OverallReadinessCachePayload {
  score: number;
  state: OverallReadinessState;
  stateLabelZh: string;
  evidenceConfidence: number;
  blockerCount: number;
  pendingConfirmationCount: number;
  calculatedAt: string;
  /** trip.updatedAt ISO — 与行程版本对齐 */
  tripUpdatedAt?: string;
}

export function buildOverallReadinessCache(
  snapshot: OverallReadinessSnapshot,
  tripUpdatedAt?: string,
): OverallReadinessCachePayload {
  return {
    score: snapshot.score,
    state: snapshot.state,
    stateLabelZh: snapshot.displayLabelZh ?? snapshot.stateLabelZh,
    evidenceConfidence: snapshot.evidenceConfidence,
    blockerCount: snapshot.blockers.length,
    pendingConfirmationCount: snapshot.pendingConfirmations.length,
    calculatedAt: snapshot.calculatedAt,
    tripUpdatedAt,
  };
}

export async function clearOverallReadinessCache(
  prisma: {
    trip: {
      findUnique: (args: {
        where: { id: string };
        select: { metadata: true };
      }) => Promise<{ metadata: unknown } | null>;
      update: (args: {
        where: { id: string };
        data: { metadata: unknown };
      }) => Promise<unknown>;
    };
  },
  tripId: string,
  toInputJson: (value: Record<string, unknown>) => unknown,
): Promise<void> {
  const trip = await prisma.trip.findUnique({
    where: { id: tripId },
    select: { metadata: true },
  });
  if (!trip) return;
  const meta =
    trip.metadata && typeof trip.metadata === 'object' && !Array.isArray(trip.metadata)
      ? { ...(trip.metadata as Record<string, unknown>) }
      : {};
  if (!(OVERALL_READINESS_CACHE_KEY in meta)) return;
  delete meta[OVERALL_READINESS_CACHE_KEY];
  await prisma.trip.update({
    where: { id: tripId },
    data: { metadata: toInputJson(meta) },
  });
}

export function readOverallReadinessCache(
  metadata: unknown,
): OverallReadinessCachePayload | null {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return null;
  const raw = (metadata as Record<string, unknown>)[OVERALL_READINESS_CACHE_KEY];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const c = raw as Record<string, unknown>;
  if (typeof c.score !== 'number' || typeof c.state !== 'string') return null;
  return {
    score: c.score,
    state: c.state as OverallReadinessState,
    stateLabelZh: typeof c.stateLabelZh === 'string' ? c.stateLabelZh : String(c.state),
    evidenceConfidence:
      typeof c.evidenceConfidence === 'number' ? c.evidenceConfidence : 0,
    blockerCount: typeof c.blockerCount === 'number' ? c.blockerCount : 0,
    pendingConfirmationCount:
      typeof c.pendingConfirmationCount === 'number' ? c.pendingConfirmationCount : 0,
    calculatedAt:
      typeof c.calculatedAt === 'string' ? c.calculatedAt : new Date(0).toISOString(),
    tripUpdatedAt: typeof c.tripUpdatedAt === 'string' ? c.tripUpdatedAt : undefined,
  };
}

/** 缓存是否仍可信：允许 cache 写 metadata 时 updatedAt 略晚于 calculatedAt */
export function isOverallReadinessCacheFresh(
  cache: OverallReadinessCachePayload,
  tripUpdatedAt: Date | string | undefined,
): boolean {
  if (!tripUpdatedAt) return true;
  const tripMs =
    tripUpdatedAt instanceof Date
      ? tripUpdatedAt.getTime()
      : Date.parse(tripUpdatedAt);
  if (!Number.isFinite(tripMs)) return true;
  const calcMs = Date.parse(cache.calculatedAt);
  if (!Number.isFinite(calcMs)) return false;
  // metadata 回写会抬高 updatedAt；10s 内视为同一次计算
  return calcMs + 10_000 >= tripMs;
}
