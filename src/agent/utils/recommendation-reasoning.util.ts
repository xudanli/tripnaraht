/**
 * 决策透明度：偏好 + 体能快照 + 行程轻量特征 → 确定性中文推荐理由（Tags 驱动，无 LLM）。
 */
import type { Itinerary, TripPlanRequest } from '../interfaces/trip-plan.interface';
import { needsGroupTripFitnessDisclaimer } from '../memory/utils/fitness-travel-preference-prompt.util';

export type RecommendationReasoningTag =
  | { kind: 'GROUP_TRIP_CONSERVATIVE' }
  | { kind: 'PACE_ALIGNED'; tripPace: string; prefPace: string }
  | { kind: 'DAILY_WALK_IN_COMFORT_BAND'; maxDayKm: number; recommendedKm: number };

export type BuildRecommendationReasoningParams = {
  travelPreference: Record<string, unknown> | null | undefined;
  itinerary: Itinerary | null | undefined;
  tripPlanRequest?: TripPlanRequest | null;
};

function aggregateItineraryWalkKm(itinerary: Itinerary | null | undefined): {
  dayCount: number;
  maxDayKm: number | null;
} {
  if (!itinerary?.days?.length) return { dayCount: 0, maxDayKm: null };
  const dayKm: number[] = [];
  for (const d of itinerary.days) {
    let meters = 0;
    for (const it of d.items ?? []) {
      const dm = it.metadata?.distance_meters;
      if (typeof dm === 'number' && Number.isFinite(dm) && dm > 0) meters += dm;
    }
    dayKm.push(meters / 1000);
  }
  const maxDayKm = dayKm.length > 0 ? Math.max(...dayKm) : null;
  return { dayCount: itinerary.days.length, maxDayKm };
}

function mapUserPaceToZh(p: string): string {
  const u = p.toUpperCase();
  if (u === 'SLOW') return '慢节奏';
  if (u === 'FAST') return '快节奏';
  return '适中节奏';
}

function mapTripPaceToZh(p: string): string {
  if (p === 'relaxed') return '偏松';
  if (p === 'dense') return '偏紧';
  return '适中';
}

export function buildRecommendationReasoningTags(params: BuildRecommendationReasoningParams): RecommendationReasoningTag[] {
  const { travelPreference: pref, itinerary, tripPlanRequest } = params;
  const tags: RecommendationReasoningTag[] = [];
  if (!pref) {
    return tags;
  }

  if (needsGroupTripFitnessDisclaimer(pref)) {
    tags.push({ kind: 'GROUP_TRIP_CONSERVATIVE' });
  }

  if (pref.request_fitness_overall_score == null) {
    return tags;
  }

  const up = typeof pref.pacePreference === 'string' ? pref.pacePreference : '';
  const tp = tripPlanRequest?.pace;
  if (tp && up) {
    const aligned =
      (tp === 'relaxed' && up === 'SLOW') ||
      (tp === 'dense' && up === 'FAST') ||
      (tp === 'normal' && up === 'MODERATE');
    if (aligned) {
      tags.push({ kind: 'PACE_ALIGNED', tripPace: tp, prefPace: up });
    }
  }

  const recKm = Number(pref.request_fitness_recommended_daily_distance_km);
  const { maxDayKm } = aggregateItineraryWalkKm(itinerary);
  if (Number.isFinite(recKm) && recKm > 0 && maxDayKm != null && maxDayKm > 0) {
    const ratio = maxDayKm / recKm;
    if (ratio >= 0.75 && ratio <= 1.25) {
      tags.push({ kind: 'DAILY_WALK_IN_COMFORT_BAND', maxDayKm, recommendedKm: recKm });
    }
  }

  return tags;
}

export function renderRecommendationReasoningZhFromTags(tags: RecommendationReasoningTag[]): string | null {
  if (!tags.length) return null;
  const lines: string[] = ['【推荐理由】'];
  for (const t of tags) {
    switch (t.kind) {
      case 'GROUP_TRIP_CONSERVATIVE':
        lines.push(
          '考虑到同行规模或老人/儿童等因素，本方案在路线强度上采用更保守的假设；画像中的单日爬升/距离仅反映主账号用户，评估时已按「同行最弱一环」思路留有余量。',
        );
        break;
      case 'PACE_ALIGNED':
        lines.push(
          `行程节奏为「${mapTripPaceToZh(t.tripPace)}」，与你在画像中偏好的「${mapUserPaceToZh(t.prefPace)}」整体一致，减少「赶场」与恢复不足的风险。`,
        );
        break;
      case 'DAILY_WALK_IN_COMFORT_BAND':
        lines.push(
          `根据体能画像建议的日均步行约 ${t.recommendedKm.toFixed(0)} km，当前草案中单日步行峰值约 ${t.maxDayKm.toFixed(1)} km，处于舒适缓冲带内（约 ±25%）。`,
        );
        break;
      default:
        break;
    }
  }
  return lines.join('\n');
}

export function buildRecommendationReasoningZhBlock(params: BuildRecommendationReasoningParams): string | null {
  const tags = buildRecommendationReasoningTags(params);
  return renderRecommendationReasoningZhFromTags(tags);
}
