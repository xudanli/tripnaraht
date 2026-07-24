/**
 * Layer1：已有行程槽位编排（哪一天顺路插入胡萨维克观鲸等）。
 */

import type { ClarificationQuestion } from '../interfaces/clarification.interface';
import type { TripPlanRequest } from '../interfaces/trip-plan.interface';
import {
  finalizeUserClarificationCopy,
  structuredPayloadToClarificationQuestion,
  type StructuredIntakeClarificationPayload,
} from './structured-intake-clarification.util';
import { detectPeakSeasonCrowdAvoidanceIntent } from './peak-season-time-shift-intake.util';
import {
  analyzeRouteAndRunIntent,
  isItinerarySlotPlacementClarificationPending,
  type TripDaySnapshotForPlacement,
} from './route-and-run-intent-analyzer.util';
import { deriveSeasonContextZh } from './trip-season-context.util';
import type { ConsultationItineraryDayInput } from '../../trips/utils/trip-prompt-summary.util';
import type { ItinerarySlotPlacementGapResult } from '../assistants/trip-planner/interfaces/itinerary-slot-placement.interface';
import {
  paSuggestedDaysToSlotCandidates,
  shouldPreferPaSlotCandidates,
} from './itinerary-slot-pa-bridge.util';

const NORTH_ICELAND =
  /胡萨维克|husav[ií]k|husavik|阿克雷里|akureyri|米湖|mývatn|myvatn|北部|north\s*iceland/i;

export type ItinerarySlotActivityKind = 'aurora' | 'whale_north' | 'generic';

/** 从用户原话推断槽位编排的活动类型（澄清卡 copy / 选日启发式） */
export function detectItinerarySlotActivityKind(message: string | undefined | null): ItinerarySlotActivityKind {
  const t = String(message ?? '').trim();
  if (!t) return 'generic';
  const hasAurora = /极光|北极光|aurora|northern\s+lights|观测日/i.test(t);
  const hasWhale = /观鲸|whale/i.test(t);
  if (hasAurora && !hasWhale) return 'aurora';
  if (hasWhale || (NORTH_ICELAND.test(t) && /安排|插入|加在|顺路/i.test(t))) {
    return 'whale_north';
  }
  return 'generic';
}

export interface ItinerarySlotCandidate {
  dayNumber: number;
  dateYmd: string;
  label: string;
  reason_zh: string;
  score: number;
  /** PA 图推理：地理顺路但该日无可用空档 */
  schedule_tight?: boolean;
}

export { deriveSeasonContextZh } from './trip-season-context.util';

export function mapTripDaysToPlacementSnapshots(
  days: ConsultationItineraryDayInput[] | null | undefined,
): TripDaySnapshotForPlacement[] {
  const sorted = [...(days ?? [])].sort((a, b) => {
    const ta = a.date?.getTime() ?? 0;
    const tb = b.date?.getTime() ?? 0;
    return ta - tb;
  });
  return sorted.map((day, idx) => {
    const items = day.ItineraryItem ?? [];
    const parts: string[] = [];
    for (const it of items) {
      const place = it.Place?.nameCN?.trim() || it.Place?.nameEN?.trim() || '';
      if (place) parts.push(place);
      if (it.note?.trim()) parts.push(it.note.trim());
      if (it.type) parts.push(String(it.type));
    }
    const dateYmd = day.date ? day.date.toISOString().slice(0, 10) : `D${idx + 1}`;
    return {
      dayNumber: idx + 1,
      dateYmd,
      itemCount: items.length,
      textBlob: parts.join(' '),
    };
  });
}

function scoreDayForNorthWhalePlacement(day: TripDaySnapshotForPlacement): number {
  let score = 0;
  if (NORTH_ICELAND.test(day.textBlob)) score += 4;
  if (/胡萨维克|husavik/i.test(day.textBlob)) score += 3;
  if (/阿克雷里|akureyri/i.test(day.textBlob)) score += 2;
  if (/米湖|myvatn/i.test(day.textBlob)) score += 1;
  if (day.itemCount <= 3) score += 1;
  if (day.itemCount === 0) score += 0.5;
  return score;
}

function scoreDayForAuroraPlacement(day: TripDaySnapshotForPlacement): number {
  let score = 1;
  if (day.itemCount <= 2) score += 3;
  else if (day.itemCount <= 4) score += 1;
  if (/米湖|myvatn|阿克雷里|胡萨维克|维克|vík|vik|钻石|冰河湖|jökulsárlón|jokulsarlon|北部|南岸/i.test(day.textBlob)) {
    score += 2;
  }
  if (/雷克雅未克|reykjavik/i.test(day.textBlob) && day.itemCount >= 5) score -= 1;
  return score;
}

function scoreDayForSlotPlacement(
  day: TripDaySnapshotForPlacement,
  kind: ItinerarySlotActivityKind,
): number {
  if (kind === 'aurora') return scoreDayForAuroraPlacement(day);
  if (kind === 'whale_north') return scoreDayForNorthWhalePlacement(day);
  return day.itemCount <= 3 ? 1 : 0.5;
}

function routeHintForSlotDay(day: TripDaySnapshotForPlacement, kind: ItinerarySlotActivityKind): string {
  if (kind === 'aurora') {
    if (/冰河湖|jökulsárlón|jokulsarlon|钻石/i.test(day.textBlob)) return '南岸暗空区';
    if (/维克|vík|vik/i.test(day.textBlob)) return '维克周边';
    if (/米湖|myvatn|阿克雷里|akureyri|胡萨维克|husavik/i.test(day.textBlob)) return '北部/东部暗空';
    return '可预留晚间观测窗口';
  }
  if (kind === 'whale_north') {
    if (/米湖|myvatn/i.test(day.textBlob)) return '米湖 → 阿克雷里方向';
    if (/胡萨维克|husavik/i.test(day.textBlob)) return '胡萨维克周边';
    if (/阿克雷里|akureyri/i.test(day.textBlob)) return '阿克雷里周边';
    return '北部走廊';
  }
  return '结合当日路线评估';
}

function freeHintForSlotDay(day: TripDaySnapshotForPlacement, kind: ItinerarySlotActivityKind): string {
  if (kind === 'aurora') {
    if (day.itemCount <= 2) return '当日活动较少，晚间更适合预留极光观测弹性';
    if (day.itemCount <= 4) return '晚间可挤出观测窗口，需避开深夜长途驾驶';
    return '当日较满，观测需替换或压缩其它晚间安排';
  }
  if (day.itemCount <= 2) return '当日已排活动较少，空档相对充裕';
  if (day.itemCount <= 4) return '下午可挤出约 2–3 小时空档';
  return '当日行程较满，插入需挤压其它活动';
}

export function suggestItinerarySlotCandidates(
  trip: TripPlanRequest | undefined | null,
  tripDays: TripDaySnapshotForPlacement[] | undefined,
  activityHint?: string,
): ItinerarySlotCandidate[] {
  const kind = detectItinerarySlotActivityKind(activityHint);
  const days = tripDays ?? [];
  if (days.length > 0) {
    const ranked = days
      .map((d) => {
        const score = scoreDayForSlotPlacement(d, kind);
        const routeHint = routeHintForSlotDay(d, kind);
        return {
          dayNumber: d.dayNumber,
          dateYmd: d.dateYmd,
          label: `D${d.dayNumber}（${d.dateYmd}）${routeHint}`,
          reason_zh: freeHintForSlotDay(d, kind),
          score,
        };
      })
      .filter((c) => c.score > 0)
      .sort((a, b) => b.score - a.score);

    if (ranked.length > 0) {
      return ranked.slice(0, 3);
    }
    return days.slice(0, Math.min(3, days.length)).map((d) => ({
      dayNumber: d.dayNumber,
      dateYmd: d.dateYmd,
      label: `D${d.dayNumber}（${d.dateYmd}）`,
      reason_zh:
        kind === 'aurora'
          ? '可根据当晚空档与云量条件手动评估是否适合观测'
          : '可根据当日路线手动评估是否顺路',
      score: 0.5,
    }));
  }

  const total =
    typeof trip?.days === 'number' && trip.days > 0
      ? trip.days
      : trip?.date_range?.start_date && trip?.date_range?.end_date
        ? Math.max(
            1,
            Math.floor(
              (new Date(`${trip.date_range.end_date}T12:00:00Z`).getTime() -
                new Date(`${trip.date_range.start_date}T12:00:00Z`).getTime()) /
                86_400_000,
            ) + 1,
          )
        : 0;

  if (total <= 0) return [];

  const start = trip?.date_range?.start_date ?? trip?.start_date;
  const out: ItinerarySlotCandidate[] = [];
  for (let i = 1; i <= Math.min(total, 7); i++) {
    let dateYmd = `第${i}天`;
    if (start && /^\d{4}-\d{2}-\d{2}$/.test(start)) {
      const d = new Date(`${start}T12:00:00.000Z`);
      d.setUTCDate(d.getUTCDate() + (i - 1));
      dateYmd = d.toISOString().slice(0, 10);
    }
    out.push({
      dayNumber: i,
      dateYmd,
      label: `D${i}（${dateYmd}）`,
      reason_zh:
        kind === 'aurora'
          ? i >= 2 && i <= 5
            ? '11–3 月夜间较适合观测，需结合云量与光害'
            : '请结合返程日与前序驾驶强度评估晚间空档'
          : i >= 2 && i <= 5
            ? '通常更接近北部走廊（需结合您完整路线核对）'
            : '请结合您的环岛顺序判断是否顺路',
      score: i >= 2 && i <= 5 ? 1 : 0.3,
    });
  }
  return out.slice(0, 3);
}

export type ItinerarySlotPlacementBuildOpts = {
  paAnalysis?: ItinerarySlotPlacementGapResult | null;
  paCandidates?: ItinerarySlotCandidate[];
  /** INTAKE 极光选日：知识库摘录（pois/practical），由 orchestrator RAG 注入 */
  auroraRagSupplementZh?: string | null;
};

export function resolveItinerarySlotCandidates(
  trip: TripPlanRequest | undefined | null,
  tripDays: TripDaySnapshotForPlacement[] | undefined,
  intakeUserMessage?: string | null,
  opts?: ItinerarySlotPlacementBuildOpts,
): ItinerarySlotCandidate[] {
  if (opts?.paCandidates?.length) return opts.paCandidates;
  if (opts?.paAnalysis && shouldPreferPaSlotCandidates(opts.paAnalysis)) {
    return paSuggestedDaysToSlotCandidates(opts.paAnalysis);
  }
  return suggestItinerarySlotCandidates(trip, tripDays, intakeUserMessage ?? undefined);
}

export function buildItinerarySlotPlacementPayload(
  trip: TripPlanRequest | undefined | null,
  tripDays: TripDaySnapshotForPlacement[] | undefined,
  intakeUserMessage?: string | null,
  opts?: ItinerarySlotPlacementBuildOpts,
): StructuredIntakeClarificationPayload {
  const nl = String(intakeUserMessage ?? trip?.message ?? '').trim();
  const activityKind = detectItinerarySlotActivityKind(nl);
  const candidates = resolveItinerarySlotCandidates(trip, tripDays, nl, opts);
  const seasonCtx = deriveSeasonContextZh(trip);
  const wantsWhalePeakShift =
    activityKind === 'whale_north' && detectPeakSeasonCrowdAvoidanceIntent(nl);
  const usedPa = Boolean(opts?.paAnalysis?.suggestedDays?.length);

  const intro = usedPa
    ? '侦测到您想在**已有行程**中插入新活动。系统已结合行程缺口与路线上下文分析，请先选定顺路的行程日，再排具体时段。'
    : activityKind === 'aurora'
      ? '侦测到您想为**已有行程**指定**极光观测日**。请先选定夜间空档相对充裕、且便于预留弹性观测窗口的行程日。'
      : activityKind === 'whale_north'
        ? '侦测到您想在**已有行程**中加入「胡萨维克观鲸 + 阿克雷里住宿」一类安排。请先选定顺路的行程日，再排观鲸时段。'
        : '侦测到您想在**已有行程**中安排新活动。请先选定顺路的行程日，再排具体时段。';

  const daySection =
    candidates.length > 0
      ? [
          activityKind === 'aurora' ? '**1. 请选择极光观测日**' : '**1. 请选择顺路安排的日期**',
          usedPa
            ? '根据行程上下文分析，以下日期相对更合适：'
            : '根据当前行程草案，以下日期相对更合适：',
          ...candidates.map((c) => `· ${c.label}：${c.reason_zh}`),
        ].join('\n')
      : activityKind === 'aurora'
        ? '**1. 请选择极光观测日**\n当前未能读取按日草案，请先确认您的行程起止与夜间空档。'
        : '**1. 请选择顺路安排的日期**\n当前未能读取按日草案，请先确认您的行程起止与北部经过日。';

  const peakSection = wantsWhalePeakShift
    ? [
        '**2. 体验优化（错峰）**',
        `${seasonCtx}胡萨维克白天团队大巴通常较密集。若选定日期后，建议优先极昼晚间场（20:30–23:30）观鲸，更易避开人潮；观鲸结束后驱车至阿克雷里约 1 小时，次日可延迟早晨出发。`,
      ].join('\n')
    : activityKind === 'aurora'
      ? [
          '**2. 观测提示**',
          `${seasonCtx}极光观测依赖夜间黑暗与相对晴朗条件；选定日期后请预留晚间弹性，并避免与前序深夜长途驾驶叠加。`,
          opts?.auroraRagSupplementZh
            ? ['**3. 知识库参考（极光观测点）**', opts.auroraRagSupplementZh].join('\n')
            : '',
        ]
          .filter(Boolean)
          .join('\n\n')
      : '';

  const message = finalizeUserClarificationCopy([intro, daySection, peakSection].filter(Boolean).join('\n\n'));

  const suggested_operations: StructuredIntakeClarificationPayload['suggested_operations'] = [
    ...candidates.map((c) => ({
      action: `PLACE_ON_D${c.dayNumber}`,
      label: c.label,
      payload: { day_number: c.dayNumber, date_ymd: c.dateYmd },
    })),
    { action: 'CUSTOM_DAY', label: '都不对，我想自定义日期' },
  ];

  if (wantsWhalePeakShift) {
    suggested_operations.push({
      action: 'SKIP_TIME_SHIFT_CONFIRM',
      label: '先选日期，稍后再确认观鲸场次',
    });
  }

  const routeType =
    activityKind === 'aurora'
      ? '极光观测日'
      : activityKind === 'whale_north'
        ? '胡萨维克观鲸 → 阿克雷里过夜'
        : '行程槽位编排';

  return {
    type: 'INTENT_COMPILE_ERROR',
    error_code: 'ITINERARY_SLOT_PLACEMENT',
    title: '行程编排助手提示',
    message,
    constraints_discovered: {
      route_type: routeType,
      risk_warnings:
        activityKind === 'aurora'
          ? ['云量与光害不确定', '行程日期待定']
          : wantsWhalePeakShift
            ? ['白天团队人潮', '行程日期待定']
            : ['行程日期待定'],
    },
    suggested_operations,
  };
}

export function buildItinerarySlotPlacementClarificationQuestion(
  trip: TripPlanRequest | undefined | null,
  tripDays: TripDaySnapshotForPlacement[] | undefined,
  intakeUserMessage?: string | null,
  opts?: ItinerarySlotPlacementBuildOpts,
): ClarificationQuestion {
  const payload = buildItinerarySlotPlacementPayload(trip, tripDays, intakeUserMessage, opts);
  return structuredPayloadToClarificationQuestion(payload, 'itinerary_slot_placement_v1');
}

export function isItinerarySlotPlacementIntakeClarificationPending(
  trip: TripPlanRequest | undefined | null,
  intakeUserMessage?: string | null,
  clarificationAnswers?: unknown[] | null,
  opts?: { tripId?: string | null; hasTripDays?: boolean },
): boolean {
  const analysis = analyzeRouteAndRunIntent(intakeUserMessage ?? trip?.message, {
    trip,
    tripId: opts?.tripId ?? trip?.trip_id,
    hasTripDays: opts?.hasTripDays,
  });
  return isItinerarySlotPlacementClarificationPending(analysis, clarificationAnswers);
}
