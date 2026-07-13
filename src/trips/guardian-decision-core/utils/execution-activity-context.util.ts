/**
 * Slice 3 — per-activity execution context (stored on Trip.metadata; ItineraryItem has no metadata column).
 */

export interface ActivityExecutionWindow {
  lastEntryAt?: string;
  closesAt?: string;
  timezone?: string;
}

export interface ActivityExecutionContext {
  plannedDepartAt?: string;
  remainingStayMinutes?: number;
  executionWindow?: ActivityExecutionWindow;
  poiKey?: string;
}

const TRIP_META_KEY = 'rfc001ExecutionActivityContext';

export function readActivityContextFromTripMetadata(
  tripMetadata: unknown,
  activityId: string,
): ActivityExecutionContext {
  const meta = (tripMetadata ?? {}) as Record<string, unknown>;
  const block = meta[TRIP_META_KEY] as
    | { byActivityId?: Record<string, ActivityExecutionContext> }
    | undefined;
  return block?.byActivityId?.[activityId] ?? {};
}

export function resolvePlannedDepartAt(input: {
  context: ActivityExecutionContext;
  endTime?: Date | null;
  startTime?: Date | null;
}): string | undefined {
  return (
    input.context.plannedDepartAt ??
    input.endTime?.toISOString() ??
    input.startTime?.toISOString()
  );
}

export function resolveRemainingStayMinutes(
  context: ActivityExecutionContext,
  fallback = 60,
): number {
  return typeof context.remainingStayMinutes === 'number'
    ? context.remainingStayMinutes
    : fallback;
}

export function readMetadataWindow(
  metadata: unknown,
): ActivityExecutionWindow | null {
  if (!metadata || typeof metadata !== 'object') return null;
  const m = metadata as Record<string, unknown>;
  const exec = m.executionWindow as ActivityExecutionWindow | undefined;
  const lastEntryAt =
    (m.lastEntryAt as string | undefined) ?? exec?.lastEntryAt;
  const closesAt = (m.closesAt as string | undefined) ?? exec?.closesAt;
  const timezone = (m.timezone as string | undefined) ?? exec?.timezone;
  if (!lastEntryAt) return null;
  return { lastEntryAt, closesAt, timezone };
}
