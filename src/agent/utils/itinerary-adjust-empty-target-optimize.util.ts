/**
 * 「优化第 N 天路线」但目标日正式行程为空：勿走廊补点 / fallback 城市模板捏造草案。
 */

import { isExistingTripRouteOrderOptimizationQuery } from './orchestration-signals.util';
import { detectPoiSlotFillIntent } from './itinerary-adjust-poi-slot-fill.util';
import { parseTripDayNumber } from './itinerary-item-add.util';
import type { OrchestratorState } from '../interfaces/trip-plan.interface';
import type { ItineraryAdjustOptimizationResult } from './itinerary-adjust-optimization-summary.util';

/** 填日 / 从零安排：允许发明内容，不走空日优化短路 */
export function isFillEmptyDayArrangeIntent(message: string): boolean {
  const t = String(message ?? '').trim();
  if (!t) return false;
  if (detectPoiSlotFillIntent(t)) return true;
  // 「第六天」或「第 6 天」
  return /(?:帮我|请|麻烦).{0,16}(?:安排|规划|充实|填满|生成).{0,24}(?:第\s*\d+\s*天|第[一二三四五六七八九十百零〇两\d]+\s*天)|(?:安排|规划)(?:第\s*\d+\s*天|第[一二三四五六七八九十百零〇两\d]+\s*天)|(?:第\s*\d+\s*天|第[一二三四五六七八九十百零〇两\d]+\s*天).{0,12}(?:安排|规划)(?:一下|行程)?/i.test(
    t,
  );
}

/**
 * 用户在说「优化/调整已有路线」，但目标日 items=0。
 * 应诚实告知暂无行程，而不是用 fallback「到达冰岛市中心」或走廊 POI 冒充改排结果。
 */
export function isRouteOptimizeOnEmptyTargetDay(params: {
  message: string;
  tripId?: string | null;
  targetDayItemCount: number;
}): boolean {
  if (params.targetDayItemCount > 0) return false;
  const msg = String(params.message ?? '').trim();
  if (!msg) return false;
  if (isFillEmptyDayArrangeIntent(msg)) return false;

  if (isExistingTripRouteOrderOptimizationQuery(params.tripId, msg)) return true;

  const dayNum = parseTripDayNumber(msg);
  if (dayNum == null) return false;
  // 「优化/调整/重排/放缓第 N 天」且非填日
  return /(?:优化|调整|重排|放缓|轻松|太赶|节奏)/i.test(msg);
}

export function buildEmptyTargetDayOptimizeAnswerZh(params: {
  targetDateIso: string;
  targetDayNumber?: number;
}): string {
  const dayLabel =
    params.targetDayNumber != null
      ? `第 ${params.targetDayNumber} 天`
      : params.targetDateIso.slice(0, 10);
  const date = params.targetDateIso.slice(0, 10);
  return (
    `${dayLabel}（${date}）当前没有任何行程安排，无法优化路线顺序。\n` +
    `如需先补全当天内容，请说「帮我安排${dayLabel}」。`
  );
}

/** 写入诚实草案卡并阻断后续发明（fallback / adaptive_replan） */
export function applyEmptyTargetDayOptimizeHalt(
  state: OrchestratorState,
  params: { targetDateIso: string; targetDayNumber?: number },
): ItineraryAdjustOptimizationResult {
  const md = (state.metadata ?? {}) as Record<string, unknown>;
  const targetDateIso = params.targetDateIso.slice(0, 10);
  const targetDayNumber = params.targetDayNumber;
  const dayLabel =
    targetDayNumber != null ? `第 ${targetDayNumber} 天` : targetDateIso;
  const answer = buildEmptyTargetDayOptimizeAnswerZh({
    targetDateIso,
    targetDayNumber,
  });

  md.itinerary_adjust_empty_target_optimize = true;
  md.itinerary_adjust_empty_target_day_item_count = 0;
  md.itinerary_adjust_target_date_iso = targetDateIso;
  if (targetDayNumber != null) md.itinerary_adjust_target_day_number = targetDayNumber;
  md.itinerary_adjust_execution_mode = 'ADVICE_ONLY';
  md.adaptive_replan_requested = false;

  const result: ItineraryAdjustOptimizationResult = {
    target_date_iso: targetDateIso,
    ...(targetDayNumber != null ? { target_day_number: targetDayNumber } : {}),
    execution_mode: 'ADVICE_ONLY',
    applied: false,
    status_label_zh: '暂无行程',
    poi_names: [],
    draft_schedule_zh: [],
    route_context_zh: '',
    optimization_summary_zh: answer,
    rationale_bullets_zh: [
      `${dayLabel}暂无景点或活动，没有可调整的路线顺序。`,
      `若要先生成当天草案，请改口为「帮我安排${dayLabel}」。`,
    ],
    apply_confirmation_zh: '',
    apply_confirmation_lines: [],
    apply_hint_zh: '',
    suppress_chat_lead: true,
    chat_answer_text_zh: answer,
    display_title_zh: `${dayLabel}（${targetDateIso}）`,
  };
  md.itinerary_adjust_result = result;

  if (state.itinerary?.days?.length) {
    state.itinerary = {
      ...state.itinerary,
      days: state.itinerary.days.map((d) =>
        String(d.date ?? '').slice(0, 10) === targetDateIso
          ? { ...d, items: [] }
          : d,
      ),
    };
  }

  state.metadata = md as typeof state.metadata;
  return result;
}
