import type { TripOutcomeFeedback } from '../interfaces/trip-outcome-feedback.interface';
import type { DecisionParams } from '../interfaces/decision-params.interface';
import type { TripFeedbackSnapshot } from '../interfaces/agent-memory-context.interface';

export const L4_TRIP_FEEDBACK_TAIL = 3;

export type TripFeedbackFatigueLevel = TripFeedbackSnapshot['fatigueLevel'];

export function mapNumericFatigueToLevel(fatigueLevel?: number): TripFeedbackFatigueLevel {
  if (fatigueLevel == null || !Number.isFinite(fatigueLevel)) return 'LOW';
  if (fatigueLevel >= 4) return 'HIGH';
  if (fatigueLevel >= 3) return 'MEDIUM';
  return 'LOW';
}

export function projectTripFeedbackSnapshots(
  feedbacks: readonly TripOutcomeFeedback[],
  cap = L4_TRIP_FEEDBACK_TAIL,
): TripFeedbackSnapshot[] {
  return feedbacks.slice(0, cap).map((f) => ({
    tripId: f.tripId,
    satisfactionScore: coerceSatisfactionScore(f.satisfaction),
    fatigueLevel: mapNumericFatigueToLevel(f.fatigueLevel),
    overallSuccess: f.overallSuccess,
    abandoned: f.abandoned,
    createdAt:
      f.createdAt instanceof Date ? f.createdAt.toISOString() : String(f.createdAt ?? new Date().toISOString()),
    primaryTags: [...(f.failurePoints ?? [])],
  }));
}

function coerceSatisfactionScore(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return 3;
  return Math.max(1, Math.min(5, Math.round(n)));
}

/**
 * 基于 L4 快照的确定性 Prior 微调（不写入 L1；仅 mutates DecisionParams）。
 */
export function applyTripFeedbackOverlayToDecisionParams(
  params: DecisionParams,
  feedbacks: readonly TripFeedbackSnapshot[],
): DecisionParams {
  if (!feedbacks.length) return params;

  const highFatigueCount = feedbacks.filter((f) => f.fatigueLevel === 'HIGH').length;
  const lowSatisfactionCount = feedbacks.filter((f) => f.satisfactionScore <= 2).length;

  if (highFatigueCount >= 2 || lowSatisfactionCount >= 1) {
    params.constraints.bufferTimeMin = Math.max(params.constraints.bufferTimeMin ?? 15, 30);
    const ascent = params.constraints.maxDailyAscentM;
    params.constraints.maxDailyAscentM =
      ascent != null ? Math.min(ascent, 600) : 600;
    params.repairPolicy.preferRestDay = true;
    params.repairPolicy.preferSplitDays = true;
  }

  return params;
}

export function hydrateRecentTripFeedbacks(raw: unknown): TripFeedbackSnapshot[] {
  if (!Array.isArray(raw)) return [];
  const out: TripFeedbackSnapshot[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const o = item as Record<string, unknown>;
    const tripId = typeof o.tripId === 'string' ? o.tripId : String(o.tripId ?? '');
    if (!tripId.trim()) continue;
    const fatigueRaw = o.fatigueLevel;
    const fatigueLevel: TripFeedbackFatigueLevel =
      fatigueRaw === 'HIGH' || fatigueRaw === 'MEDIUM' || fatigueRaw === 'LOW'
        ? fatigueRaw
        : mapNumericFatigueToLevel(
            typeof fatigueRaw === 'number'
              ? fatigueRaw
              : typeof fatigueRaw === 'string' && fatigueRaw.trim() !== ''
                ? Number(fatigueRaw)
                : undefined,
          );
    const createdAt =
      typeof o.createdAt === 'string' && o.createdAt.trim()
        ? o.createdAt
        : new Date().toISOString();
    out.push({
      tripId,
      satisfactionScore: coerceSatisfactionScore(o.satisfactionScore),
      fatigueLevel,
      overallSuccess: o.overallSuccess !== false,
      abandoned: o.abandoned === true,
      createdAt,
      primaryTags: Array.isArray(o.primaryTags)
        ? o.primaryTags.map((t) => String(t)).filter(Boolean)
        : [],
    });
  }
  return out.slice(0, L4_TRIP_FEEDBACK_TAIL);
}
