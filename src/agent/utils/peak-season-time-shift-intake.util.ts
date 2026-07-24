/**
 * 盛夏旺季 POI 人潮错峰 + 极昼时间平移（胡萨维克观鲸 → 阿克雷里过夜）。
 */

import type { GateResult, TripPlanRequest } from '../interfaces/trip-plan.interface';
import { deriveSeasonContextZh } from './trip-season-context.util';
import { stripSystemMessageBlocksForIntakeNl } from './trip-plan-intake-vehicle.util';

export const MIDNIGHT_SUN_WHALE_SLOT = {
  start_local: '20:30',
  end_local: '23:30',
  label_zh: '午夜阳光观鲸场',
} as const;

export const HUSAVIK_TO_AKUREYRI_DRIVE_MINS = 60;
export const NEXT_DAY_DELAYED_DEPARTURE_LOCAL = '10:00';

export interface PeakSeasonTimeShiftSignals {
  peak_season_crowd_avoidance: true;
  whale_watching_husavik: true;
  overnight_stay_akureyri: true;
  activity_date_ymd?: string;
  interpretation_zh: string;
  disambiguation_zh?: string;
}

export function detectPeakSeasonCrowdAvoidanceIntent(text: string): boolean {
  const t = String(text ?? '');
  const avoidCrowd = /避开|错峰|人潮|拥挤|大巴|旅游团|团队巴士|peak\s*season/i.test(t);
  const activity =
    /观鲸|whale\s*watch/i.test(t) ||
    (/胡萨维克|Husav[ií]k|husavik/i.test(t) && /北部|北线/i.test(t));
  const northCorridor = /胡萨维克|Husav[ií]k|husavik|阿克雷里|Akureyri/i.test(t);
  return avoidCrowd && activity && northCorridor;
}

export function extractActivityDateYmdFromNl(text: string, refYear?: number): string | undefined {
  const t = stripSystemMessageBlocksForIntakeNl(text);
  const year = refYear ?? new Date().getFullYear();
  const m1 = t.match(/(\d{1,2})\s*月\s*(\d{1,2})\s*号?/);
  if (m1) {
    const month = parseInt(m1[1], 10);
    const day = parseInt(m1[2], 10);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
  }
  const m2 = t.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (m2) return m2[0];
  return undefined;
}

export function resolvePeakSeasonActivityDateYmd(
  trip: TripPlanRequest | undefined | null,
  intakeNl: string,
  refYear?: number,
): string | undefined {
  const placed =
    trip?.guardian_debate_trip_context?.scheduling_constraints?.itinerary_slot_placement?.date_ymd;
  if (placed && /^\d{4}-\d{2}-\d{2}$/.test(placed)) return placed;
  return extractActivityDateYmdFromNl(intakeNl, refYear);
}

export function buildPeakSeasonTimeShiftSignals(
  intakeNl: string,
  refYear?: number,
  trip?: TripPlanRequest | null,
): PeakSeasonTimeShiftSignals | undefined {
  const nl = stripSystemMessageBlocksForIntakeNl(intakeNl);
  if (!detectPeakSeasonCrowdAvoidanceIntent(nl)) return undefined;

  const activityDate = resolvePeakSeasonActivityDateYmd(trip, nl, refYear);
  const seasonCtx = deriveSeasonContextZh(trip ?? undefined);
  const dateNote = activityDate ? `（${activityDate}）` : `（${seasonCtx}）`;

  return {
    peak_season_crowd_avoidance: true,
    whale_watching_husavik: true,
    overnight_stay_akureyri: true,
    activity_date_ymd: activityDate,
    interpretation_zh:
      `希望在胡萨维克安排观鲸并夜宿阿克雷里${dateNote}，并避开白天旅游大巴集中时段，利用极昼窗口提升体验。`,
    disambiguation_zh:
      '若将观鲸排在白天团队高峰，须在说明中写明与「避开大巴人潮」诉求的冲突；优先推荐极昼晚间场次并确认次日出发延迟。',
  };
}

export function isPeakSeasonWhaleTimeShiftScenario(
  trip: TripPlanRequest | undefined | null,
  intakeUserMessage?: string | null,
): boolean {
  const nl = stripSystemMessageBlocksForIntakeNl(
    intakeUserMessage ?? String(trip?.message ?? ''),
  );
  if (detectPeakSeasonCrowdAvoidanceIntent(nl)) return true;
  return Boolean(trip?.guardian_debate_trip_context?.user_intent_anchors?.peak_season_crowd_avoidance);
}

export function applyPeakSeasonTimeShiftSignalsToTripPlan(
  trip: TripPlanRequest,
  signals: PeakSeasonTimeShiftSignals,
  intakeUserMessage?: string | null,
): TripPlanRequest {
  const nl = intakeUserMessage ?? trip.message;
  return {
    ...trip,
    ...(nl ? { message: nl } : {}),
    guardian_debate_trip_context: {
      ...(trip.guardian_debate_trip_context ?? {}),
      user_intent_anchors: {
        ...(trip.guardian_debate_trip_context?.user_intent_anchors ?? {}),
        peak_season_crowd_avoidance: true,
        whale_watching_husavik: true,
        overnight_stay_akureyri: true,
        interpretation_zh: signals.interpretation_zh,
        disambiguation_zh: signals.disambiguation_zh,
        midnight_sun_continuous_drive: false,
        ring_road_full_scope: false,
      },
      scheduling_constraints: {
        ...(trip.guardian_debate_trip_context?.scheduling_constraints ?? {}),
        whale_watching_slot: {
          date: signals.activity_date_ymd,
          start_local: MIDNIGHT_SUN_WHALE_SLOT.start_local,
          end_local: MIDNIGHT_SUN_WHALE_SLOT.end_local,
          venue_zh: '胡萨维克',
          slot_label_zh: MIDNIGHT_SUN_WHALE_SLOT.label_zh,
        },
        next_day_delayed_departure_until: NEXT_DAY_DELAYED_DEPARTURE_LOCAL,
        overnight_drive_after_activity: true,
      },
    },
    persona_hint: {
      drdre_tolerance: 'MEDIUM',
      neptune_creativity: 'EXPLORATORY',
      abu_strictness: 'NORMAL',
      ...trip.persona_hint,
    },
  };
}

export function buildDeterministicPeakSeasonGuardianResults(
  gate: GateResult,
  signals: PeakSeasonTimeShiftSignals,
): NonNullable<GateResult['guardian_results']> {
  const slot = `${MIDNIGHT_SUN_WHALE_SLOT.start_local}–${MIDNIGHT_SUN_WHALE_SLOT.end_local}`;
  const dateNote = signals.activity_date_ymd ? ` ${signals.activity_date_ymd}` : '';

  return {
    source: 'llm_debate',
    is_simulated: true,
    abu: {
      verdict: 'ALLOW',
      evidence: [
        '极昼晚间观鲸与后续短途北上驾驶在合规车型下可执行；无 F 路/涉水硬约束。',
        '须保留真实预订时段与船公司班次，不得虚构「午夜场」库存。',
      ],
    },
    neptune: {
      verdict: 'REPLACE',
      evidence: [
        `胡萨维克白天团队大巴密集；建议将观鲸排至${dateNote || '所选行程日'} ${slot}「${MIDNIGHT_SUN_WHALE_SLOT.label_zh}」，利用白夜光线错峰人潮。`,
        '核心体验不降档：仍为胡萨维克出海观鲸，仅时间窗平移至晚间高峰外。',
      ],
    },
    drdre: {
      verdict: 'ADJUST',
      evidence: [
        `观鲸结束接近午夜，胡萨维克→阿克雷里约 ${HUSAVIK_TO_AKUREYRI_DRIVE_MINS} 分钟；当日不宜再排高强度活动。`,
        `次日（D+1）上午出发不早于 ${NEXT_DAY_DELAYED_DEPARTURE_LOCAL}，插入延迟出发约束以消化深夜驾驶疲劳。`,
      ],
    },
    debate_summary_zh:
      `${signals.interpretation_zh} 推荐锁定 ${slot} 观鲸场次；结束后驱车至阿克雷里，次日早晨延迟出发。`,
  };
}
