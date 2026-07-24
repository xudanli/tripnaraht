/**
 * INTAKE / 门禁澄清：用户侧结构化契约（禁止三人格 Raw 草稿、L3 机读块、Prompt 术语泄露）。
 */

import type { ClarificationQuestion } from '../interfaces/clarification.interface';
import type { GateResult, TripPlanRequest } from '../interfaces/trip-plan.interface';
import type { IntakeGap } from './clarification-question-generator.util';
import { extractGuardianDebateUserIntentAnchors } from './guardian-debate-user-intent-anchor.util';
import { findMarathonLowerBoundDeferredGap, resolveTripPlanNlMessage } from './marathon-intake-signals.util';
import { stripSystemMessageBlocksForIntakeNl } from './trip-plan-intake-vehicle.util';
import { buildFroadHighlandIntentSignals, isFroad2wdComplianceScenario } from './froad-intake-signals.util';
import {
  buildPeakSeasonTimeShiftSignals,
  isPeakSeasonWhaleTimeShiftScenario,
  MIDNIGHT_SUN_WHALE_SLOT,
  NEXT_DAY_DELAYED_DEPARTURE_LOCAL,
} from './peak-season-time-shift-intake.util';
import {
  analyzeRouteAndRunIntent,
  isItinerarySlotPlacementClarificationPending,
  isPeakSeasonFollowUpClarificationPending,
} from './route-and-run-intent-analyzer.util';
import { deriveSeasonContextZh } from './trip-season-context.util';

export const RING_ROAD_KM = 1332;
const RING_ROAD_AVG_SPEED_KMH = 70;
const DEFAULT_MAX_DRIVING_HOURS = 10;

/** 编排器内部术语 — 不得出现在 question / answer_text */
const INTERNAL_AGENT_LEAK =
  /\b(?:Abu|Dr\.?\s*Dre|Neptune)\b|(?:REPLACE|ADJUST|ALLOW|REJECT)\s*(?:为|→|:)|合议摘要|残余风险|须关注：|三人格立场|guardian_debate|marathon_replace|L3-DEFER|L3-PROOF|midnight_sun_continuous_drive|vehicle_drivetrain|debate_gate_fusion|INTENT_COMPILE_BLOCK/gi;

const PERSONA_LINE =
  /^\s*[·•]?\s*(?:Abu|Dr\.?\s*Dre|Neptune)\s*[（(][^）)]*[）)]\s*[:：]/im;

export interface StructuredClarificationConstraints {
  route_type?: string;
  suggested_vehicle?: string;
  risk_warnings?: string[];
}

export interface StructuredClarificationOperation {
  action: string;
  label: string;
  payload?: Record<string, unknown>;
}

export interface StructuredIntakeClarificationPayload {
  type: 'INTENT_COMPILE_ERROR' | 'MARATHON_CONTINUOUS_DRIVE';
  error_code?: string;
  title: string;
  message: string;
  constraints_discovered?: StructuredClarificationConstraints;
  suggested_operations?: StructuredClarificationOperation[];
}

/** 用户 NL 是否表达「约 1 个日历日 / 24h 连续」马拉松（与 Trip 回填天数解耦） */
export function inferNlMarathonCalendarDays(intakeUserMessage?: string | null): number | undefined {
  const nl = stripSystemMessageBlocksForIntakeNl(String(intakeUserMessage ?? ''));
  if (!nl.trim()) return undefined;
  if (/24\s*小时|24h|24\s*h|不间断|一口气/i.test(nl) && /环岛|绕岛|一号公路|ring\s*road/i.test(nl)) {
    return 1;
  }
  const m = nl.match(/(\d+)\s*天(?!\s*\d)/);
  if (m) {
    const d = parseInt(m[1], 10);
    if (d >= 1 && d <= 30) return d;
  }
  return undefined;
}

/** Trip 档案日历天数（date_range 或 days 字段），与用户本轮 NL 意图解耦 */
export function resolveTripCalendarDaysForClarification(
  trip: TripPlanRequest | undefined | null,
): number | undefined {
  const tripDays = typeof trip?.days === 'number' && trip.days > 0 ? trip.days : undefined;
  if (tripDays != null) return tripDays;
  if (trip?.date_range?.start_date && trip?.date_range?.end_date) {
    const a = new Date(`${trip.date_range.start_date}T12:00:00.000Z`);
    const b = new Date(`${trip.date_range.end_date}T12:00:00.000Z`);
    if (Number.isFinite(a.getTime()) && Number.isFinite(b.getTime())) {
      const diff = Math.round((b.getTime() - a.getTime()) / 86400000) + 1;
      if (diff >= 1 && diff <= 60) return diff;
    }
  }
  return undefined;
}

export interface MarathonDayClarificationContext {
  userIntentDays: number;
  userIntentHours: number;
  tripCalendarDays?: number;
  tripCalendarHours?: number;
  calendarsDiverge: boolean;
}

export function resolveMarathonDayClarificationContext(
  trip: TripPlanRequest | undefined | null,
  intakeUserMessage?: string | null,
): MarathonDayClarificationContext {
  const userIntentDays = resolvePlanningDaysForUserClarification(trip, intakeUserMessage);
  const tripCalendarDays = resolveTripCalendarDaysForClarification(trip);
  const calendarsDiverge =
    tripCalendarDays != null && tripCalendarDays !== userIntentDays;
  return {
    userIntentDays,
    userIntentHours: requiredDrivingHoursPerDay(userIntentDays),
    tripCalendarDays,
    tripCalendarHours:
      tripCalendarDays != null ? requiredDrivingHoursPerDay(tripCalendarDays) : undefined,
    calendarsDiverge,
  };
}

/** 门禁/马拉松澄清：安全节奏一句（对齐 NL「24h」与 Trip 日历天数） */
export function buildMarathonSafetyRhythmZh(ctx: MarathonDayClarificationContext): string {
  const {
    userIntentDays,
    userIntentHours,
    tripCalendarDays,
    tripCalendarHours,
    calendarsDiverge,
  } = ctx;

  if (calendarsDiverge && tripCalendarDays != null && tripCalendarHours != null) {
    if (userIntentDays === 1) {
      return (
        `安全节奏：您表述的是「24 小时不间断」环岛（按约 1 个出行日理解，全程约 ${RING_ROAD_KM} km，不计休息也远超过 24 小时可行窗口）。` +
        `当前绑定行程档案为 ${tripCalendarDays} 天；若按档案把驾驶摊到各日，日均约 ${tripCalendarHours} 小时，仍不等于「一口气跑完」环岛。请确认以哪一种为准（或改为分段 / 精华段）。`
      );
    }
    return (
      `安全节奏：按您本轮表述约 ${userIntentDays} 个出行日，无法在约 24 小时内安全完成全程环岛。` +
      `当前绑定行程档案为 ${tripCalendarDays} 天（日均约 ${tripCalendarHours} 小时驾驶），与本轮表述不一致，请确认以哪一项为准。`
    );
  }

  if (userIntentDays === 1) {
    return (
      `安全节奏：按「24 小时不间断」理解，无法在约 1 个日历日内安全完成全程环岛（约 ${userIntentHours} 小时/日等效强度）；需分段休息、增加天数或缩小范围。`
    );
  }

  return `安全节奏：约 ${userIntentDays} 个出行日内无法安全完成「24 小时不间断」环岛；需分段休息或增加天数。`;
}

/** 马拉松结构化澄清：环岛可行性段落（含 Trip 档案对照） */
export function buildMarathonRingRoadFeasibilityZh(ctx: MarathonDayClarificationContext): string {
  const { userIntentDays, userIntentHours, tripCalendarDays, tripCalendarHours, calendarsDiverge } =
    ctx;

  let line =
    `环岛全程约 ${RING_ROAD_KM} 公里。按您本轮表述（约 ${userIntentDays} 个出行日），` +
    `即使不计休息，日均驾驶也约 ${userIntentHours} 小时，**无法**在约 24 小时内安全完成全程。`;

  if (calendarsDiverge && tripCalendarDays != null && tripCalendarHours != null) {
    line += `（当前绑定行程档案为 ${tripCalendarDays} 天，若按档案均分日均约 ${tripCalendarHours} 小时，不等于「24h 一口气跑完」；请确认以哪一项为准。）`;
  }

  return line;
}

/**
 * 澄清/合议展示用天数：优先用户本轮 NL 的日历意图，避免 Trip 回填 7 天污染「1 天 24h」话术。
 */
export function resolvePlanningDaysForUserClarification(
  trip: TripPlanRequest | undefined | null,
  intakeUserMessage?: string | null,
): number {
  const nlDays = inferNlMarathonCalendarDays(intakeUserMessage);
  if (nlDays != null) return nlDays;
  return resolveTripCalendarDaysForClarification(trip) ?? 1;
}

export function requiredDrivingHoursPerDay(days: number): number {
  const d = Math.max(1, days);
  return Math.round((RING_ROAD_KM / d / RING_ROAD_AVG_SPEED_KMH) * 10) / 10;
}

export function suggestedDaysForRingRoadLowerBound(): number {
  return Math.max(2, Math.ceil(RING_ROAD_KM / RING_ROAD_AVG_SPEED_KMH / DEFAULT_MAX_DRIVING_HOURS));
}

/** 去掉内部人格名、状态机 verdict、L3 审计块 */
export function scrubInternalAgentLeakage(text: string): string {
  let s = String(text ?? '');
  s = s.replace(/\[L3-(?:PROOF|DEFER)\|[^\]]*\]/gi, '');
  s = s.replace(/\[SYSTEM_MESSAGE\][\s\S]*?(?:\n\n|$)/gi, '');
  s = s.replace(INTERNAL_AGENT_LEAK, '');
  s = s.replace(PERSONA_LINE, '');
  s = s.replace(/\n{3,}/g, '\n\n');
  // 仅折叠行内空白，保留段落换行（勿用 \s{2,}，会把 \n\n 压成空格）
  return s
    .replace(/[^\S\n]{2,}/g, ' ')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

/** 按段落去重，打断 LLM 重复套娃 */
export function dedupeRepeatedClarificationParagraphs(text: string): string {
  const parts = String(text ?? '')
    .split(/\n+/)
    .map((p) => p.trim())
    .filter(Boolean);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of parts) {
    const key = p.replace(/\s+/g, '');
    if (!key) continue;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(p);
  }
  return out.join('\n').trim();
}

export function finalizeUserClarificationCopy(text: string): string {
  return dedupeRepeatedClarificationParagraphs(scrubInternalAgentLeakage(text));
}

export function buildPhysicalLowerBoundStructuredPayload(
  trip: TripPlanRequest | undefined | null,
  intakeUserMessage?: string | null,
): StructuredIntakeClarificationPayload {
  const days = resolvePlanningDaysForUserClarification(trip, intakeUserMessage);
  const hours = requiredDrivingHoursPerDay(days);
  const suggested = suggestedDaysForRingRoadLowerBound();
  const tripDays =
    typeof trip?.days === 'number' && trip.days > 0 && trip.days !== days ? trip.days : undefined;

  let message =
    `您好！已识别到您的「冰岛极昼连续自驾环岛」需求。环岛一号公路全长约 ${RING_ROAD_KM} 公里；` +
    `按您当前表述（约 ${days} 个出行日），日均驾驶约 ${hours} 小时，超过常见安全上限（约 ${DEFAULT_MAX_DRIVING_HOURS} 小时/天）。`;
  if (tripDays != null) {
    message += `（行程档案为 ${tripDays} 天，与本轮「${days} 日/24h」表述不一致，请确认以哪一项为准。）`;
  }
  message += ' 为保障安全与体验，请调整天数或缩小范围后再继续规划。';

  return {
    type: 'INTENT_COMPILE_ERROR',
    error_code: 'LOWER_BOUND_LIMIT',
    title: '需要您确认或补充信息',
    message,
    constraints_discovered: {
      route_type: '环岛 / 一号公路主廊道',
      suggested_vehicle: '建议确认四驱与租车条款（未指定时勿默认两驱）',
      risk_warnings: ['单日驾驶时长超限', '连续驾驶疲劳', '天气与路况突变'],
    },
    suggested_operations: [
      {
        action: 'EXTEND_DAYS',
        label: `延长为约 ${suggested} 天（推荐）`,
        payload: { days: suggested },
      },
      {
        action: 'SHRINK_SCOPE',
        label: '缩小为南岸精华（1 天可行）',
        payload: { scope: 'SOUTH_COAST' },
      },
      {
        action: 'RESTATE_INTENT',
        label: '重新说明诉求（天数 / 是否 24h 连续）',
      },
    ],
  };
}

export function structuredPayloadToClarificationQuestion(
  payload: StructuredIntakeClarificationPayload,
  questionId: string,
): ClarificationQuestion {
  const options =
    payload.suggested_operations?.map((op) => ({
      value: op.action,
      label: op.label,
    })) ?? [];

  const body = finalizeUserClarificationCopy(payload.message);

  return {
    id: questionId,
    question: body,
    type: 'single_choice',
    required: true,
    options,
    hint: payload.title,
    metadata: {
      structured_clarification: payload,
      presentation: 'structured_intake_v1',
    },
  };
}

export function buildPhysicalLowerBoundClarificationQuestion(
  trip: TripPlanRequest | undefined | null,
  _gap?: IntakeGap,
  intakeUserMessage?: string | null,
): ClarificationQuestion {
  const payload = buildPhysicalLowerBoundStructuredPayload(trip, intakeUserMessage);
  return structuredPayloadToClarificationQuestion(payload, 'intent_compile_lower_bound_v1');
}

export function buildMarathonContinuousDriveClarificationPayload(
  trip: TripPlanRequest | undefined | null,
  intakeUserMessage?: string | null,
): StructuredIntakeClarificationPayload {
  const dayCtx = resolveMarathonDayClarificationContext(trip, intakeUserMessage);
  const physicsMin = suggestedDaysForRingRoadLowerBound();
  const tripCalendarDays = resolveTripCalendarDaysForClarification(trip);
  const suggested =
    tripCalendarDays != null && tripCalendarDays >= physicsMin
      ? tripCalendarDays
      : physicsMin;
  const anchors = extractGuardianDebateUserIntentAnchors(
    stripSystemMessageBlocksForIntakeNl(intakeUserMessage ?? resolveTripPlanNlMessage(trip, intakeUserMessage)),
  );

  const message =
    finalizeUserClarificationCopy(
      [
        anchors?.interpretation_zh
          ? `已理解：${anchors.interpretation_zh}`
          : '已理解您希望利用极昼窗口进行高强度连续自驾环岛。',
        buildMarathonRingRoadFeasibilityZh(dayCtx),
        '建议：将驾驶拆到多个日历日（保留完整路线），或缩小为南岸精华一日游。',
        '尚未收到您指定的租车两驱/四驱，规划不会默认车型。',
      ].join('\n\n'),
    );

  return {
    type: 'MARATHON_CONTINUOUS_DRIVE',
    error_code: 'MARATHON_DEFERRED_LOWER_BOUND',
    title: '需要您确认或补充信息',
    message,
    constraints_discovered: {
      route_type: '环岛 / 一号公路（完整或近完整）',
      suggested_vehicle: '请确认两驱或四驱',
      risk_warnings: ['连续驾驶疲劳', '单日时长超限', '节律与休息不足'],
    },
    suggested_operations: [
      {
        action: 'ACCEPT_SEGMENTED_RING',
        label:
          tripCalendarDays != null && tripCalendarDays >= physicsMin
            ? `接受按行程 ${tripCalendarDays} 天分段环岛（保留完整一号公路）`
            : `接受分段环岛（建议约 ${Math.min(suggested, 3)}–${suggested} 天完成）`,
        payload: { days: suggested },
      },
      {
        action: 'EXTEND_DAYS',
        label:
          tripCalendarDays != null
            ? `调整行程天数（当前档案 ${tripCalendarDays} 天）`
            : `调整行程天数（如 ${suggested} 天）`,
        payload: { days: suggested },
      },
      {
        action: 'SHRINK_SCOPE',
        label: '改为南岸精华（1 天可行）',
        payload: { scope: 'SOUTH_COAST' },
      },
      {
        action: 'RESTATE_INTENT',
        label: '重新说明（是否坚持 24h 连续、车型）',
      },
    ],
  };
}

export function buildMarathonIntakeClarificationQuestion(
  trip: TripPlanRequest | undefined | null,
  intakeUserMessage?: string | null,
): ClarificationQuestion {
  const payload = buildMarathonContinuousDriveClarificationPayload(trip, intakeUserMessage);
  return structuredPayloadToClarificationQuestion(payload, 'marathon_continuous_drive_v1');
}

export function buildFroad2wdComplianceClarificationPayload(
  trip: TripPlanRequest | undefined | null,
  intakeUserMessage?: string | null,
): StructuredIntakeClarificationPayload {
  const nl = stripSystemMessageBlocksForIntakeNl(
    intakeUserMessage ?? String(trip?.message ?? ''),
  );
  const signals = buildFroadHighlandIntentSignals(nl) ?? {
    f_road_highland_crossing: true as const,
    interpretation_zh: '计划经 F 路穿越内陆高地',
  };
  const froad = signals.primary_froad ?? 'F208';
  const dest = signals.destination_highland_zh ?? '兰德曼纳劳卡';

  const message = finalizeUserClarificationCopy(
    [
      signals.interpretation_zh,
      signals.melt_season_risk_zh,
      `结论：普通 2WD 不能按原方案穿越 ${froad} 典型涉水/碎石段；冰岛 F 路须合规四驱。`,
      `可行替补：经 26 号公路接 ${froad} 北段（非涉水廊道）抵达 ${dest} 一带，出发前请查 road.is 水位与开放状态。`,
      '改线会增加行驶时间，请预留休息与住宿接驳弹性。',
    ]
      .filter(Boolean)
      .join('\n\n'),
  );

  return {
    type: 'INTENT_COMPILE_ERROR',
    error_code: 'FROAD_2WD_COMPLIANCE',
    title: '需要您确认或补充信息',
    message,
    constraints_discovered: {
      route_type: `${froad} 内陆高地穿越`,
      suggested_vehicle: '4WD（F 路法定准入）',
      risk_warnings: ['车型不合规', '融雪涉水', '保险免责', '绕行加时'],
    },
    suggested_operations: [
      {
        action: 'UPGRADE_VEHICLE_TO_4WD',
        label: '一键升级为 4WD 车型',
        payload: { vehicle_type: '4WD' },
      },
      {
        action: 'ACCEPT_NEPTUNE_DETOUR',
        label: `接受替补路线（26→${froad} 北段，2WD）`,
        payload: { route_variant: 'RT26_F208_NORTH_NON_FORD' },
      },
      {
        action: 'SWITCH_GUIDE_MODE',
        label: '切换向导模式（本地向导/团）',
        payload: { guide_mode: true },
      },
      {
        action: 'RESTATE_INTENT',
        label: '重新说明车型与路线',
      },
    ],
  };
}

export function buildFroad2wdIntakeClarificationQuestion(
  trip: TripPlanRequest | undefined | null,
  intakeUserMessage?: string | null,
): ClarificationQuestion {
  const payload = buildFroad2wdComplianceClarificationPayload(trip, intakeUserMessage);
  return structuredPayloadToClarificationQuestion(payload, 'froad_2wd_compliance_v1');
}

export function buildPeakSeasonTimeShiftClarificationPayload(
  trip: TripPlanRequest | undefined | null,
  intakeUserMessage?: string | null,
): StructuredIntakeClarificationPayload {
  const nl = stripSystemMessageBlocksForIntakeNl(
    intakeUserMessage ?? String(trip?.message ?? ''),
  );
  const signals =
    buildPeakSeasonTimeShiftSignals(nl, new Date().getFullYear(), trip) ?? {
      peak_season_crowd_avoidance: true,
      whale_watching_husavik: true,
      overnight_stay_akureyri: true,
      interpretation_zh: '旺季北部观鲸错峰',
    };
  const slot = `${MIDNIGHT_SUN_WHALE_SLOT.start_local}–${MIDNIGHT_SUN_WHALE_SLOT.end_local}`;
  const seasonCtx = deriveSeasonContextZh(trip ?? undefined);

  const message = finalizeUserClarificationCopy(
    [
      signals.interpretation_zh,
      `${seasonCtx}胡萨维克白天团队大巴密集。建议将观鲸改到极昼晚间 ${slot}（${MIDNIGHT_SUN_WHALE_SLOT.label_zh}），在白夜光线下避开人潮。`,
      `观鲸结束后驱车前往阿克雷里（约 1 小时）；次日早晨建议不早于 ${NEXT_DAY_DELAYED_DEPARTURE_LOCAL} 出发，以消化深夜驾驶疲劳。`,
    ].join('\n\n'),
  );

  return {
    type: 'INTENT_COMPILE_ERROR',
    error_code: 'PEAK_SEASON_TIME_SHIFT',
    title: '需要您确认或补充信息',
    message,
    constraints_discovered: {
      route_type: '胡萨维克观鲸 → 阿克雷里过夜',
      suggested_vehicle: '按已选车型评估（无额外四驱要求）',
      risk_warnings: ['白天团队人潮', '深夜短途驾驶', '次日延迟出发'],
    },
    suggested_operations: [
      {
        action: 'LOCK_MIDNIGHT_SUN_WHALE_SLOT',
        label: '锁定午夜阳光场',
        payload: {
          slot: MIDNIGHT_SUN_WHALE_SLOT,
          date: signals.activity_date_ymd,
        },
      },
      {
        action: 'KEEP_DAYTIME_SLOT',
        label: '仍安排白天场次（接受人潮风险）',
      },
      {
        action: 'RESTATE_INTENT',
        label: '重新说明日期或观鲸偏好',
      },
    ],
  };
}

export function buildPeakSeasonTimeShiftIntakeClarificationQuestion(
  trip: TripPlanRequest | undefined | null,
  intakeUserMessage?: string | null,
): ClarificationQuestion {
  const payload = buildPeakSeasonTimeShiftClarificationPayload(trip, intakeUserMessage);
  return structuredPayloadToClarificationQuestion(payload, 'peak_season_midnight_sun_whale_v1');
}

export function isPeakSeasonTimeShiftIntakeClarificationPending(
  trip: TripPlanRequest | undefined | null,
  intakeUserMessage?: string | null,
  clarificationAnswers?: unknown[] | null,
  opts?: { tripId?: string | null; hasTripDays?: boolean },
): boolean {
  if (!isPeakSeasonWhaleTimeShiftScenario(trip, intakeUserMessage)) return false;

  const analysis = analyzeRouteAndRunIntent(intakeUserMessage ?? trip?.message, {
    trip,
    tripId: opts?.tripId ?? trip?.trip_id,
    hasTripDays: opts?.hasTripDays,
  });
  if (isItinerarySlotPlacementClarificationPending(analysis, clarificationAnswers)) {
    return false;
  }
  if (
    analysis.slot_placement_requested &&
    analysis.sub_signals.peak_season_crowd_avoidance
  ) {
    return isPeakSeasonFollowUpClarificationPending(analysis, clarificationAnswers);
  }

  if (!Array.isArray(clarificationAnswers) || clarificationAnswers.length === 0) return true;
  const ids = new Set(
    clarificationAnswers.map((a) => String((a as { questionId?: string })?.questionId ?? '')),
  );
  return !ids.has('peak_season_midnight_sun_whale_v1');
}

export function isFroad2wdIntakeClarificationPending(
  trip: TripPlanRequest | undefined | null,
  intakeUserMessage?: string | null,
  clarificationAnswers?: unknown[] | null,
): boolean {
  if (!isFroad2wdComplianceScenario(trip, intakeUserMessage)) return false;
  if (!Array.isArray(clarificationAnswers) || clarificationAnswers.length === 0) return true;
  const ids = new Set(
    clarificationAnswers.map((a) => String((a as { questionId?: string })?.questionId ?? '')),
  );
  return !ids.has('froad_2wd_compliance_v1');
}

export function isMarathonDeferredIntakeClarificationPending(
  gaps: IntakeGap[] | undefined,
  clarificationAnswers?: unknown[] | null,
): boolean {
  if (!findMarathonLowerBoundDeferredGap(gaps)) return false;
  return isMarathonIntakeClarificationAnswerPending(clarificationAnswers);
}

/** 马拉松澄清是否尚未被用户回答（与 gaps 来源无关） */
export function isMarathonIntakeClarificationAnswerPending(
  clarificationAnswers?: unknown[] | null,
): boolean {
  if (!Array.isArray(clarificationAnswers) || clarificationAnswers.length === 0) return true;
  const ids = new Set(
    clarificationAnswers.map((a) => String((a as { questionId?: string })?.questionId ?? '')),
  );
  return !ids.has('marathon_continuous_drive_v1') && !ids.has('guardian_debate_abu_reject_v1');
}

/**
 * INTAKE 马拉松澄清：优先 compiler SOFT gap；绑定 Trip 且 NL 已表达极昼马拉松时也短路，
 * 避免 POI 阶段用国家级目的地触发「范围过大」误澄清。
 */
export function isMarathonIntakeClarificationPending(
  gaps: IntakeGap[] | undefined,
  intakeUserMessage?: string | null,
  clarificationAnswers?: unknown[] | null,
): boolean {
  if (findMarathonLowerBoundDeferredGap(gaps)) {
    return isMarathonIntakeClarificationAnswerPending(clarificationAnswers);
  }
  const nl = stripSystemMessageBlocksForIntakeNl(String(intakeUserMessage ?? ''));
  if (!nl.trim()) return false;
  const anchors = extractGuardianDebateUserIntentAnchors(nl);
  if (!anchors?.midnight_sun_continuous_drive) return false;
  return isMarathonIntakeClarificationAnswerPending(clarificationAnswers);
}
