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
import { detectItineraryAdjustIntent, detectFullTripReplanIntent } from './itinerary-adjust-intent.util';
import { stripUiInjectedDayScheduleContext } from './ui-day-schedule-context.util';
import { parseTripDayNumber } from './itinerary-item-add.util';
import { stripPlanningModeWrapper } from './strip-planning-mode-wrapper.util';

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

/** 话术/UI 是否已锚定具体 DayN（含 day editor 文末 `[日程] DayN`） */
export function hasConcreteTripDayAnchor(message: string): boolean {
  const t = String(message ?? '');
  if (!t.trim()) return false;
  if (parseTripDayNumber(t) != null) return true;
  if (/\bDay\s*\d+\b/i.test(t) || /\bday\d+\b/i.test(t)) return true;
  if (/\[日程\]\s*Day\s*\d+/i.test(t)) return true;
  return false;
}

/** 是否仍在追问「排哪一天」（相对已锚定 DayN 的选日卡） */
function isAskingWhichTripDay(message: string): boolean {
  const t = stripUiInjectedDayScheduleContext(
    stripPlanningModeWrapper(stripSystemMessageBlocksForIntakeNl(String(message ?? ''))),
  );
  return /哪一天|哪几天|哪些天|哪天|那几天|哪个行程|哪一程|安排在哪|加在哪|插在哪|放在哪|放进哪/i.test(
    t,
  );
}

/**
 * 「规划哪几天空的行程」= 识别/填充空日，不是「把某活动插到哪一天」的槽位编排。
 * 例：可以帮我规划一下哪几天空的行程吗？
 */
export function isEmptyTripDaysPlanningIntent(message: string): boolean {
  const t = stripUiInjectedDayScheduleContext(
    stripPlanningModeWrapper(stripSystemMessageBlocksForIntakeNl(String(message ?? ''))),
  );
  if (!t.trim()) return false;
  if (
    /空的?(?:行程|天|日程|日子)|哪几天.{0,8}空|空着的?(?:天|行程|日程)|还?没(?:有)?安排|没有安排|未安排/i.test(
      t,
    )
  ) {
    return /(?:规划|安排|填充|充实|填满|补齐|帮我|请)/i.test(t) || /哪几天.{0,8}空/i.test(t);
  }
  return false;
}

/** 用户是否在问「已有行程里哪一天/哪一程」或要把某类体验落到具体日期 */
export function detectItinerarySlotPlacementIntent(message: string): boolean {
  const raw = stripSystemMessageBlocksForIntakeNl(String(message ?? ''));
  const t = stripPlanningModeWrapper(raw);
  if (!t.trim()) return false;

  /** 空日填充 ≠ 槽位选日澄清 */
  if (isEmptyTripDaysPlanningIntent(raw)) {
    return false;
  }

  /**
   * day editor / 已写明 DayN：目标日已知，勿再短路「选哪一天」澄清卡。
   * 「那几天定为极光」等仍显式问哪一天时除外。
   */
  if (hasConcreteTripDayAnchor(raw) && !isAskingWhichTripDay(raw)) {
    return false;
  }

  const daySelectionRe =
    /哪一天|哪几天|哪些天|哪天|那几天|哪个行程|哪一程|安排在哪|加在哪|插在|放进|能否在.{0,24}安排|顺路/i;
  const tripDayAnchorRe = /行程|第\s*\d+\s*天|D\s*\d+/i;
  const activityPlacementRe =
    /观鲸|胡萨维克|阿克雷里|极光|北极光|aurora|northern\s+lights|观测日|活动|安排/i;

  // 「我应该把那几天定为极光观测日」类：选日 + 体验类型（非整段 GENERAL_PLAN）
  if (
    /(?:把|将).{0,12}(?:那|哪|几)\s*天.{0,16}(?:定为|设为|当作|作为).{0,16}(?:极光|北极光|观鲸|观测)/i.test(
      t,
    )
  ) {
    return true;
  }

  const semantic = stripUiInjectedDayScheduleContext(t);
  return (
    daySelectionRe.test(semantic) &&
    (tripDayAnchorRe.test(semantic) || activityPlacementRe.test(semantic))
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
    detectFullTripReplanIntent(intake_nl, {
      start_date: opts?.trip?.date_range?.start_date,
      end_date: opts?.trip?.date_range?.end_date,
    })
  ) {
    return {
      primary: 'GENERAL_PLAN',
      sub_signals,
      slot_placement_requested,
      intake_nl,
    };
  }

  if (
    hasContext &&
    (detectItineraryAdjustIntent(intake_nl, {
      start_date: opts?.trip?.date_range?.start_date,
      end_date: opts?.trip?.date_range?.end_date,
    }) ||
      (opts?.hasTripDays === true && sub_signals.marathon_deferred))
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
