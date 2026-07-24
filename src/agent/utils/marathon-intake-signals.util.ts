import type { GateResult, OrchestratorState, TripPlanRequest } from '../interfaces/trip-plan.interface';
import type { IntakeGap } from './clarification-question-generator.util';
import { stripSystemMessageBlocksForIntakeNl } from './trip-plan-intake-vehicle.util';
import {
  extractGuardianDebateUserIntentAnchors,
  inferPersonaHintFromUserIntentAnchors,
  type GuardianDebateUserIntentAnchors,
} from './guardian-debate-user-intent-anchor.util';

const RING_ROAD_KM = 1332;
const RING_ROAD_AVG_SPEED_KMH = 70;
const DEFAULT_MAX_DRIVING_HOURS = 10;

export interface MarathonIntakeSignals {
  deferred: true;
  user_intent_anchors: GuardianDebateUserIntentAnchors;
  suggested_days?: number;
  required_hours_per_day?: number;
}

export function isMarathonLowerBoundDeferredGap(gap: IntakeGap | undefined): boolean {
  if (!gap || gap.severity !== 'SOFT' || gap.type !== 'INTENT_COMPILE_ERROR') return false;
  return String(gap.detail ?? '').includes('L3-DEFER|midnight_sun_continuous_drive');
}

export function findMarathonLowerBoundDeferredGap(
  gaps: OrchestratorState['gaps'] | IntakeGap[] | undefined,
): IntakeGap | undefined {
  return (gaps ?? []).find((g) => isMarathonLowerBoundDeferredGap(g as IntakeGap));
}

export function resolveTripPlanNlMessage(
  trip: TripPlanRequest | null | undefined,
  intakeUserMessage?: string | null,
): string {
  const raw =
    trip?.message ??
    (trip as { intake_user_message?: string } | undefined)?.intake_user_message ??
    intakeUserMessage ??
    '';
  return String(raw).trim();
}

export function buildMarathonIntakeSignalsFromGaps(
  gaps: OrchestratorState['gaps'] | IntakeGap[] | undefined,
  trip: TripPlanRequest | undefined,
  intakeUserMessage?: string | null,
): MarathonIntakeSignals | undefined {
  const gap = findMarathonLowerBoundDeferredGap(gaps);
  if (!gap) return undefined;

  const message = resolveTripPlanNlMessage(trip, intakeUserMessage);
  const anchors =
    trip?.guardian_debate_trip_context?.user_intent_anchors ??
    extractGuardianDebateUserIntentAnchors(message);
  if (!anchors?.midnight_sun_continuous_drive) return undefined;

  const days = typeof trip?.days === 'number' && trip.days > 0 ? trip.days : 1;
  const requiredHoursPerDay = RING_ROAD_KM / days / RING_ROAD_AVG_SPEED_KMH;
  const minPhysicsDays = Math.ceil(RING_ROAD_KM / (RING_ROAD_AVG_SPEED_KMH * DEFAULT_MAX_DRIVING_HOURS));

  return {
    deferred: true,
    user_intent_anchors: anchors,
    suggested_days: Math.max(minPhysicsDays, 7),
    required_hours_per_day: Math.round(requiredHoursPerDay * 10) / 10,
  };
}

/** STATE_UPDATE 从 DSO 投影后会剥掉辩论 SKU；从 base trip + metadata 回填。 */
export function mergeTripPlanDebateCarryover(
  next: TripPlanRequest,
  prev: TripPlanRequest | undefined,
  intakeUserMessage?: string | null,
): TripPlanRequest {
  if (!prev && !intakeUserMessage) return next;

  const merged: TripPlanRequest = { ...next };
  const message = resolveTripPlanNlMessage(prev, intakeUserMessage);
  if (message && !merged.message) merged.message = message;

  if (prev?.guardian_debate_trip_context) {
    merged.guardian_debate_trip_context = {
      ...(prev.guardian_debate_trip_context ?? {}),
      ...(merged.guardian_debate_trip_context ?? {}),
      user_intent_anchors:
        prev.guardian_debate_trip_context.user_intent_anchors ??
        merged.guardian_debate_trip_context?.user_intent_anchors,
    };
  }

  const persona =
    prev?.persona_hint ??
    inferPersonaHintFromUserIntentAnchors(
      merged.guardian_debate_trip_context?.user_intent_anchors ??
        extractGuardianDebateUserIntentAnchors(message),
    );
  if (persona) {
    merged.persona_hint = { ...persona, ...merged.persona_hint };
  }

  return merged;
}

export function applyMarathonIntakeSignalsToTripPlan(
  trip: TripPlanRequest,
  signals: MarathonIntakeSignals,
  intakeUserMessage?: string | null,
): TripPlanRequest {
  const message = resolveTripPlanNlMessage(trip, intakeUserMessage);
  const next: TripPlanRequest = { ...trip };
  if (message) next.message = message;

  next.guardian_debate_trip_context = {
    ...(next.guardian_debate_trip_context ?? {}),
    user_intent_anchors: signals.user_intent_anchors,
    scheduling_constraints: {
      ...(next.guardian_debate_trip_context?.scheduling_constraints ?? {}),
      driving_limit_strict: false,
      logical_continuous_window_hours: 24,
    },
  };

  const persona = inferPersonaHintFromUserIntentAnchors(signals.user_intent_anchors);
  if (persona) next.persona_hint = { ...persona, ...next.persona_hint };

  return next;
}

/** INTAKE 豁免后，在 Gate 注入 SOFT 违规与调整项，供三人格辩论消费（非硬拦截）。 */
export function enrichGateForMarathonDeferredLowerBound(
  gate: GateResult,
  trip: TripPlanRequest | undefined,
  gaps: OrchestratorState['gaps'] | undefined,
  intakeUserMessage?: string | null,
): GateResult {
  const signals = buildMarathonIntakeSignalsFromGaps(gaps, trip, intakeUserMessage);
  if (!signals) return gate;

  const days = typeof trip?.days === 'number' && trip.days > 0 ? trip.days : 1;
  const hours = signals.required_hours_per_day ?? RING_ROAD_KM / days / RING_ROAD_AVG_SPEED_KMH;

  const marathonViolation = {
    type: 'FATIGUE' as const,
    severity: 'SOFT' as const,
    detail:
      `[L3-DEFER|midnight_sun_continuous_drive] 极昼连续自驾马拉松：` +
      `环岛约 ${RING_ROAD_KM}km、${days} 天日历下日均驾驶约 ${hours} 小时，` +
      `超过 ${DEFAULT_MAX_DRIVING_HOURS} 小时安全上限；须编排生物钟强制休息与错峰窗口。`,
  };

  const violations = [...(gate.violations ?? [])];
  if (!violations.some((v) => String(v.detail ?? '').includes('midnight_sun_continuous_drive'))) {
    violations.push(marathonViolation);
  }

  const adjustments = [...(gate.required_adjustments ?? [])];
  if (!adjustments.some((a) => String(a.why ?? '').includes('02:00'))) {
    adjustments.push({
      action: 'ADD_BUFFER',
      why: '极昼马拉松：须在凌晨 02:00–06:00 插入生物钟强制休息（Dr.Dre），避免视觉疲劳与节律过载。',
    });
  }
  if (signals.suggested_days && days < signals.suggested_days) {
    if (!adjustments.some((a) => a.action === 'CHANGE_DATES')) {
      adjustments.push({
        action: 'CHANGE_DATES',
        why: `环岛物理下界建议至少 ${signals.suggested_days} 天日历窗口（当前 ${days} 天）；或按 24 小时逻辑连续窗编排。`,
      });
    }
  }

  const gate_result =
    gate.gate_result === 'BLOCK' ? gate.gate_result : ('ADJUST_REQUIRED' as GateResult['gate_result']);

  return {
    ...gate,
    gate_result,
    violations,
    required_adjustments: adjustments,
    confidence: Math.min(gate.confidence ?? 0.8, 0.75),
  };
}

const MARATHON_DRE_DENIAL =
  /1\s*天单程|无高强度|体力负荷低|节奏可接受|无连续.*疲劳|驾驶时长未提供但无过载/i;

export function debateIgnoresMarathonAnchors(
  anchors: GuardianDebateUserIntentAnchors | undefined,
  summary: {
    drdre_verdict?: string;
    debate_summary_zh?: string;
    drdre_evidence?: string[];
  },
): boolean {
  if (!anchors?.midnight_sun_continuous_drive) return false;
  if (summary.drdre_verdict === 'ADJUST' || summary.drdre_verdict === 'REJECT') return false;

  const blob = [summary.debate_summary_zh ?? '', ...(summary.drdre_evidence ?? [])].join('\n');
  if (MARATHON_DRE_DENIAL.test(blob)) return true;

  return summary.drdre_verdict === 'ALLOW' && !/强制休息|02:00|生物钟|19|驾驶.*小时|极昼|连续自驾/.test(blob);
}

function resolveMarathonDebatePlanningDays(
  trip: TripPlanRequest | undefined,
  intakeUserMessage?: string | null,
): number {
  const nl = stripSystemMessageBlocksForIntakeNl(
    String(intakeUserMessage ?? resolveTripPlanNlMessage(trip)),
  );
  if (/24\s*小时|24h|24\s*h|不间断|一口气/i.test(nl) && /环岛|绕岛|一号公路|ring\s*road/i.test(nl)) {
    return 1;
  }
  if (typeof trip?.days === 'number' && trip.days > 0) return trip.days;
  return 1;
}

export function buildDeterministicMarathonGuardianResults(
  gate: GateResult,
  anchors: GuardianDebateUserIntentAnchors,
  trip: TripPlanRequest | undefined,
  intakeUserMessage?: string | null,
): NonNullable<GateResult['guardian_results']> {
  const days = resolveMarathonDebatePlanningDays(trip, intakeUserMessage);
  const hours =
    days > 0 ? Math.round((RING_ROAD_KM / days / RING_ROAD_AVG_SPEED_KMH) * 10) / 10 : 19;
  const explicitVehicle = trip?.constraints?.vehicle_type;
  const fRoadRisk = explicitVehicle === '2WD';
  const vehicleUnspecified = explicitVehicle !== '2WD' && explicitVehicle !== '4WD';
  const ringScope = Boolean(anchors.ring_road_full_scope);

  const abuVerdict: 'ALLOW' | 'REJECT' = fRoadRisk ? 'REJECT' : 'ALLOW';
  const abuNeedsVehicleConfirm = vehicleUnspecified && ringScope && !fRoadRisk;
  const abuEvidence = fRoadRisk
    ? [
        '2WD 与高地/F 路组合在冰岛通常不可合规执行；须四驱或改走一号公路环岛主廊道。',
        '极昼马拉松不等于可无视路况与车险条款。',
      ]
    : abuNeedsVehicleConfirm
      ? [
          '未指定租车驱动形式；冰岛环岛主廊道部分路段与租车条款通常按 4WD 评估合规与保险覆盖。',
          '极昼连续驾驶不等于可无视车型限制；请确认是否升级四驱或缩小路线范围。',
        ]
      : ['主干道组合在合规车型下可继续评估。'];

  return {
    source: 'llm_debate',
    is_simulated: true,
    abu: {
      verdict: abuVerdict,
      evidence: abuEvidence,
      evidence_atoms: [
        {
          text: fRoadRisk
            ? '2WD+F 路/高地为硬性合规风险'
            : abuNeedsVehicleConfirm
              ? '车型未指定，环岛须确认 4WD/保险条款'
              : '车型与主干道匹配',
          violation_code: 'DEBATE:ABU_MARATHON',
          tag: 'safety',
        },
      ],
    },
    drdre: {
      verdict: 'ADJUST',
      evidence: [
        `用户极昼连续自驾诉求下，${days} 天日历约需日均 ${hours} 小时驾驶，远超安全窗。`,
        '须在凌晨 02:00–06:00 强制插入 REST（生物钟过载），并错峰安排景观停靠。',
        '不得将「24 小时不间断环岛」降格为雷克雅未克市内 2 小时散步行程。',
      ],
      evidence_atoms: [
        {
          text: `日均驾驶 ${hours}h > ${DEFAULT_MAX_DRIVING_HOURS}h 上限`,
          violation_code: 'DEBATE:DRE_MARATHON',
          tag: 'fatigue',
        },
      ],
    },
    neptune: {
      verdict: 'REPLACE',
      evidence: [
        '须将 POI/路线锚定环冰岛一号公路主廊道，避免默认高地 F 路候选。',
        '凌晨时段优先安排低流量瀑布/海岸停靠，白天覆盖长驾驶段。',
      ],
      evidence_atoms: [
        {
          text: '环岛马拉松须 REPLACE 非环线路段',
          violation_code: 'DEBATE:NEP_MARATHON',
          tag: 'generic',
        },
      ],
    },
    debate_summary_zh:
      `已识别极昼连续自驾马拉松诉求（${anchors.interpretation_zh ?? '连续自驾/环岛'}）。` +
      `Dr.Dre 要求 ADJUST：插入 02:00–06:00 强制休息并承认 ${hours}h/日驾驶过载；` +
      (fRoadRisk
        ? 'Abu REJECT 2WD 上高地/F 路，须四驱或改线；'
        : abuNeedsVehicleConfirm
          ? 'Abu 提示：未指定车型，环岛须确认 4WD/保险；'
          : '') +
      `Neptune REPLACE 为环一号公路编排。残余风险：节律疲劳、封路、天气突变。`,
  };
}
