/**
 * route_and_run 双层意图：Layer1 行程槽位编排 vs Layer2 领域 SKU 约束。
 *
 * Code Review 不变量（改动 INTAKE 短路 / 新 SKU 时逐条核对）：
 * - CR-01: primary === ITINERARY_SLOT_PLACEMENT 时，Layer2 SKU 不得跳过选日澄清
 * - CR-02: PA 空列表 / 低置信 / bridge 空候选 / 异常 → 启发式 + slot_placement_pa_fallback
 * - CR-03: 季节文案仅经 trip-season-context.util deriveSeasonContextZh，禁止硬编码月份
 */

import type { TripPlanRequest } from '../interfaces/trip-plan.interface';
import { detectPeakSeasonCrowdAvoidanceIntent } from './peak-season-time-shift-intake.util';
import { isFroad2wdComplianceScenario } from './froad-intake-signals.util';
import { stripSystemMessageBlocksForIntakeNl } from './trip-plan-intake-vehicle.util';
import { extractGuardianDebateUserIntentAnchors } from './guardian-debate-user-intent-anchor.util';
import { detectItineraryAdjustIntent } from './itinerary-adjust-intent.util';

export type RouteAndRunPrimaryIntent =
  | 'ITINERARY_SLOT_PLACEMENT'
  | 'ITINERARY_ADJUST'
  | 'SKU_SHORT_CIRCUIT'
  | 'GENERAL_PLAN';

export interface RouteAndRunSubSkuSignals {
  peak_season_crowd_avoidance: boolean;
  froad_2wd_compliance: boolean;
  marathon_deferred: boolean;
  whale_watching_north: boolean;
}

export interface RouteAndRunIntentAnalysis {
  primary: RouteAndRunPrimaryIntent;
  sub_signals: RouteAndRunSubSkuSignals;
  slot_placement_requested: boolean;
  intake_nl: string;
}

export type TripDaySnapshotForPlacement = {
  dayNumber: number;
  dateYmd: string;
  city?: string | null;
  itemCount: number;
  textBlob: string;
};

/** 用户是否在问「已有行程里哪一天/哪一程」 */
export function detectItinerarySlotPlacementIntent(message: string): boolean {
  const t = stripSystemMessageBlocksForIntakeNl(String(message ?? ''));
  if (!t.trim()) return false;
  return (
    /哪一天|哪几天|哪个行程|哪一程|安排在哪|加在哪|插在|放进|能否在.{0,24}安排|顺路/i.test(t) &&
    (/行程|第\s*\d+\s*天|D\s*\d+/i.test(t) ||
      /观鲸|胡萨维克|阿克雷里|活动|安排/i.test(t))
  );
}

export function collectSubSkuSignals(
  message: string,
  trip?: TripPlanRequest | null,
): RouteAndRunSubSkuSignals {
  const nl = stripSystemMessageBlocksForIntakeNl(message);
  const anchors = extractGuardianDebateUserIntentAnchors(nl);
  return {
    peak_season_crowd_avoidance: detectPeakSeasonCrowdAvoidanceIntent(nl),
    froad_2wd_compliance: isFroad2wdComplianceScenario(trip ?? undefined, nl),
    marathon_deferred: Boolean(anchors?.midnight_sun_continuous_drive),
    whale_watching_north:
      /观鲸|whale/i.test(nl) && /胡萨维克|husavík|husavik|阿克雷里|akureyri/i.test(nl),
  };
}

/**
 * 分析本轮主意图：绑定 trip 且用户问「哪一天」时，优先 SLOT_PLACEMENT，避免 SKU 时段短路抢答。
 */
export function analyzeRouteAndRunIntent(
  message: string | undefined | null,
  opts?: {
    trip?: TripPlanRequest | null;
    tripId?: string | null;
    hasTripDays?: boolean;
  },
): RouteAndRunIntentAnalysis {
  const intake_nl = stripSystemMessageBlocksForIntakeNl(String(message ?? ''));
  const sub_signals = collectSubSkuSignals(intake_nl, opts?.trip);
  const slot_placement_requested = detectItinerarySlotPlacementIntent(intake_nl);
  const tripBound = Boolean(opts?.tripId?.trim() || opts?.trip?.trip_id?.trim());
  const hasContext = tripBound && (opts?.hasTripDays !== false);

  if (slot_placement_requested && hasContext) {
    return {
      primary: 'ITINERARY_SLOT_PLACEMENT',
      sub_signals,
      slot_placement_requested: true,
      intake_nl,
    };
  }

  if (
    hasContext &&
    opts?.hasTripDays === true &&
    (detectItineraryAdjustIntent(intake_nl) || sub_signals.marathon_deferred)
  ) {
    return {
      primary: 'ITINERARY_ADJUST',
      sub_signals,
      slot_placement_requested,
      intake_nl,
    };
  }

  if (sub_signals.froad_2wd_compliance || sub_signals.peak_season_crowd_avoidance) {
    return {
      primary: 'SKU_SHORT_CIRCUIT',
      sub_signals,
      slot_placement_requested,
      intake_nl,
    };
  }

  return {
    primary: 'GENERAL_PLAN',
    sub_signals,
    slot_placement_requested,
    intake_nl,
  };
}

export function isItinerarySlotPlacementClarificationPending(
  analysis: RouteAndRunIntentAnalysis | undefined,
  clarificationAnswers?: unknown[] | null,
): boolean {
  if (analysis?.primary !== 'ITINERARY_SLOT_PLACEMENT') return false;
  if (!Array.isArray(clarificationAnswers) || clarificationAnswers.length === 0) return true;
  const ids = new Set(
    clarificationAnswers.map((a) => String((a as { questionId?: string })?.questionId ?? '')),
  );
  return !ids.has('itinerary_slot_placement_v1');
}

/** 已选行程日后，是否仍需旺季错峰场次确认 */
export function isPeakSeasonFollowUpClarificationPending(
  analysis: RouteAndRunIntentAnalysis | undefined,
  clarificationAnswers?: unknown[] | null,
): boolean {
  if (!analysis?.sub_signals.peak_season_crowd_avoidance) return false;
  if (analysis.primary === 'ITINERARY_SLOT_PLACEMENT') {
    const ids = new Set(
      (clarificationAnswers ?? []).map((a) =>
        String((a as { questionId?: string })?.questionId ?? ''),
      ),
    );
    if (!ids.has('itinerary_slot_placement_v1')) return false;
  }
  if (!Array.isArray(clarificationAnswers) || clarificationAnswers.length === 0) {
    return analysis.primary === 'SKU_SHORT_CIRCUIT';
  }
  const ids = new Set(
    clarificationAnswers.map((a) => String((a as { questionId?: string })?.questionId ?? '')),
  );
  return !ids.has('peak_season_midnight_sun_whale_v1');
}
