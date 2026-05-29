import type { ClarificationQuestion } from '../interfaces/clarification.interface';
import type { GateResult, TripPlanRequest } from '../interfaces/trip-plan.interface';
import { resolveTripPlanNlMessage } from './marathon-intake-signals.util';
import { extractGuardianDebateUserIntentAnchors } from './guardian-debate-user-intent-anchor.util';
import { isVehicleTypeUserSpecifiedInNl } from './trip-plan-intake-vehicle.util';
import { isFroad2wdComplianceScenario } from './froad-intake-signals.util';
import { isPeakSeasonWhaleTimeShiftScenario } from './peak-season-time-shift-intake.util';
import {
  buildFroad2wdComplianceClarificationPayload,
  buildMarathonContinuousDriveClarificationPayload,
  buildMarathonSafetyRhythmZh,
  buildPeakSeasonTimeShiftClarificationPayload,
  dedupeRepeatedClarificationParagraphs,
  finalizeUserClarificationCopy,
  resolveMarathonDayClarificationContext,
  scrubInternalAgentLeakage,
  structuredPayloadToClarificationQuestion,
} from './structured-intake-clarification.util';

export type DebateFeasibilityVerdict = 'INFEASIBLE' | 'NEEDS_TRADEOFF' | 'FEASIBLE_WITH_CHANGES';

export interface UserIntentFeasibilityForDebate {
  user_intent_echo_zh: string;
  feasibility_verdict: DebateFeasibilityVerdict;
  feasibility_summary_zh: string;
  preamble_zh: string;
}

/**
 * 三人格澄清卡顶部：复述用户「疯狂」诉求 + 针对该诉求的可行性（非泛泛 SKU）。
 * 供前端 `metadata.user_intent_feasibility` 分区展示。
 */
export function buildUserIntentFeasibilityForDebate(
  trip: TripPlanRequest | undefined | null,
  intakeUserMessage?: string | null,
): UserIntentFeasibilityForDebate | undefined {
  const intakeMsg = intakeUserMessage?.trim() || resolveDebateIntakeUserMessage(trip);
  const anchors =
    trip?.guardian_debate_trip_context?.user_intent_anchors ??
    extractGuardianDebateUserIntentAnchors(intakeMsg);
  const echo =
    anchors?.interpretation_zh ??
    (intakeMsg
      ? `您提到：「${intakeMsg.slice(0, 120)}${intakeMsg.length > 120 ? '…' : ''}」`
      : undefined);
  if (!echo) return undefined;

  const dayCtx = resolveMarathonDayClarificationContext(trip, intakeMsg);
  const marathonNl =
    dayCtx.userIntentDays === 1 || /24\s*小时|24h|不间断|一口气/i.test(intakeMsg ?? '');

  let verdict: DebateFeasibilityVerdict = 'NEEDS_TRADEOFF';
  let summary: string;

  if (anchors?.midnight_sun_continuous_drive && anchors?.ring_road_full_scope && marathonNl) {
    verdict = 'INFEASIBLE';
    summary =
      dayCtx.calendarsDiverge && dayCtx.tripCalendarDays != null && dayCtx.tripCalendarHours != null
        ? `在「约 24 小时内不间断跑完完整环岛」前提下不可行；即便按行程档案 ${dayCtx.tripCalendarDays} 天均分（约 ${dayCtx.tripCalendarHours} 小时/日）也不等于「一口气跑完」。`
        : '在「约 24 小时内不间断跑完完整环岛」前提下不可行（全程约 1332 km，不计休息也远超 24 小时窗口）。';
  } else if (anchors?.midnight_sun_continuous_drive || (anchors?.ring_road_full_scope && marathonNl)) {
    verdict = 'INFEASIBLE';
    summary =
      '高强度连续自驾 + 完整环岛与常见安全/休息约束冲突；需分段、增天或缩线后才能继续规划。';
  } else if (anchors?.ring_road_full_scope) {
    verdict = 'NEEDS_TRADEOFF';
    summary = '完整环岛可行性与日历天数、车型和路况绑定；请确认天数与租车驱动形式。';
  } else {
    verdict = 'FEASIBLE_WITH_CHANGES';
    summary = '下方为三人格针对您本轮表述的对照结论，请结合按钮确认或补充。';
  }

  const preamble_zh = finalizeUserClarificationCopy(
    [`按您本轮诉求：${echo}`, `针对该诉求的可行性：${summary}`].join('\n\n'),
  );

  return {
    user_intent_echo_zh: echo,
    feasibility_verdict: verdict,
    feasibility_summary_zh: summary,
    preamble_zh,
  };
}

function resolveDebateIntakeUserMessage(
  trip: TripPlanRequest | undefined | null,
): string | undefined {
  const meta = (trip as { metadata?: { intake_user_message?: string } } | undefined)?.metadata;
  const fromMeta = meta?.intake_user_message?.trim();
  if (fromMeta) return fromMeta;
  return resolveTripPlanNlMessage(trip ?? undefined) || undefined;
}

/** trip.constraints 上有车型（可能为历史误写） */
export function isVehicleTypeSpecifiedOnTrip(trip: TripPlanRequest | undefined | null): boolean {
  const vt = trip?.constraints?.vehicle_type;
  return vt === '2WD' || vt === '4WD';
}

/** 用户 NL 是否明示车型（展示/辩论清洗用，优先于 constraints） */
export function isVehicleTypeUserSpecifiedForDebate(
  trip: TripPlanRequest | undefined | null,
  intakeUserMessage?: string | null,
): boolean {
  return isVehicleTypeUserSpecifiedInNl(trip, intakeUserMessage);
}

const USER_CHOSE_2WD_NARRATIVE =
  /(?:用户|您).{0,32}(?:指定|选择|使用|已选).{0,20}(?:车辆|车型|租车)?.{0,8}(?:为|是)?\s*(?:2\s*wd|两驱|二驱|前驱)|(?:用户|您).{0,16}(?:2\s*wd|两驱)\s*(?:车|车辆)|(?:原案|当前方案|约束).{0,20}(?:2\s*wd|两驱)|(?:2\s*wd|两驱)\s*[+＋].{0,12}(?:24|连续|环岛)|2\s*wd\s*车辆|车辆.{0,10}(?:为|是)\s*(?:2\s*wd|两驱)/i;

export function debateInventsFalse2wdWhenVehicleUnspecified(
  trip: TripPlanRequest | undefined | null,
  gr: NonNullable<GateResult['guardian_results']>,
): boolean {
  if (isVehicleTypeUserSpecifiedForDebate(trip)) return false;
  const blob = [
    gr.debate_summary_zh ?? '',
    ...(gr.abu?.evidence ?? []),
    ...(gr.neptune?.evidence ?? []),
    ...(gr.drdre?.evidence ?? []),
  ].join('\n');
  return USER_CHOSE_2WD_NARRATIVE.test(blob);
}

export function scrubUnspecifiedVehicleNarrative(text: string, vehicleSpecified: boolean): string {
  if (vehicleSpecified || !text.trim()) return finalizeUserClarificationCopy(text);
  let s = text;
  s = s.replace(/三方一致否决\s*[「「]?\s*2\s*wd\s*[+＋]\s*/gi, '合议否决「');
  s = s.replace(/2\s*wd\s*[+＋]\s*24\s*小时/gi, '24 小时');
  s = s.replace(/因\s*2\s*wd\s*[+＋]?/gi, '因连续驾驶强度与');
  s = s.replace(/2\s*wd\s*车辆合规性不足/gi, '租车驱动形式未确认（环岛通常建议评估四驱）');
  s = s.replace(/2\s*wd\s*在冰岛/gi, '未指定车型在冰岛');
  s = s.replace(/用户指定车辆为\s*2\s*wd/gi, '用户未指定租车驱动形式');
  s = s.replace(/用户(?:已)?(?:选择|指定|使用)\s*(?:车辆|车型|租车)?\s*(?:为|是)?\s*2\s*wd/gi, '用户未指定租车驱动形式');
  s = s.replace(/指定车辆为\s*2\s*wd/gi, '未确认车型');
  s = s.replace(/车辆为\s*2\s*wd/gi, '未确认车型（勿默认两驱）');
  s = s.replace(/(?:^|[；;。\n])\s*2\s*wd\s*[+＋]/gim, '$1');
  return finalizeUserClarificationCopy(s);
}

export function abuRejectOnlyFromFalseUser2wdClaim(
  gr: NonNullable<GateResult['guardian_results']>,
  vehicleSpecified: boolean,
): boolean {
  if (vehicleSpecified || gr.abu?.verdict !== 'REJECT') return false;
  const raw = (gr.abu?.evidence ?? []).join('\n');
  if (!USER_CHOSE_2WD_NARRATIVE.test(raw)) return false;
  const hasIndependentHard =
    /F\s*路|高地|封路|涉水|4\s*wd|四驱|保险.{0,8}拒|禁止驶入/i.test(raw) &&
    !/用户指定车辆为\s*2\s*wd|用户.{0,12}指定.{0,12}2\s*wd/i.test(raw);
  return !hasIndependentHard;
}

function scrubEvidenceLines(lines: string[] | undefined, vehicleSpecified: boolean): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of lines ?? []) {
    if (typeof raw !== 'string' || !raw.trim()) continue;
    const e = scrubUnspecifiedVehicleNarrative(raw, vehicleSpecified);
    if (!e) continue;
    const key = e.replace(/\s+/g, '').slice(0, 80);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(e);
    if (out.length >= 2) break;
  }
  return out;
}

export function sanitizeGuardianResultsForUnspecifiedVehicle(
  gr: NonNullable<GateResult['guardian_results']>,
  trip: TripPlanRequest | undefined | null,
): NonNullable<GateResult['guardian_results']> {
  const intakeMsg = resolveDebateIntakeUserMessage(trip);
  const vehicleSpecified = isVehicleTypeUserSpecifiedForDebate(trip, intakeMsg);
  if (vehicleSpecified) return gr;

  const abuEvidence = scrubEvidenceLines(gr.abu?.evidence, false);
  const abuOnlyFalse2wd = abuRejectOnlyFromFalseUser2wdClaim(gr, false);

  return {
    ...gr,
    abu: gr.abu
      ? {
          ...gr.abu,
          verdict: abuOnlyFalse2wd ? 'ALLOW' : gr.abu.verdict,
          evidence: abuOnlyFalse2wd
            ? [
                '未指定租车驱动形式；环岛建议结合天气与条款确认是否四驱。',
                ...abuEvidence.filter((e) => !USER_CHOSE_2WD_NARRATIVE.test(e)),
              ].filter(Boolean)
                .slice(0, 3)
            : abuEvidence,
        }
      : gr.abu,
    drdre: gr.drdre
      ? { ...gr.drdre, evidence: scrubEvidenceLines(gr.drdre.evidence, false) }
      : gr.drdre,
    neptune: gr.neptune
      ? { ...gr.neptune, evidence: scrubEvidenceLines(gr.neptune.evidence, false) }
      : gr.neptune,
    debate_summary_zh: gr.debate_summary_zh
      ? scrubUnspecifiedVehicleNarrative(gr.debate_summary_zh, false)
      : gr.debate_summary_zh,
  };
}

/**
 * 门禁合议 → 极简用户叙事（禁止三人格 Raw、禁止重复 debate_summary）。
 */
export function formatGuardianDebateConclusionForUserZh(
  gate: GateResult,
  trip?: TripPlanRequest | null,
): string {
  const gr = gate.guardian_results;
  if (!gr) return '';

  const intakeMsg = resolveDebateIntakeUserMessage(trip ?? undefined);
  if (isFroad2wdComplianceScenario(trip, intakeMsg)) {
    return buildFroad2wdComplianceClarificationPayload(trip, intakeMsg).message;
  }

  if (isPeakSeasonWhaleTimeShiftScenario(trip, intakeMsg)) {
    return buildPeakSeasonTimeShiftClarificationPayload(trip, intakeMsg).message;
  }

  const vehicleSpecified = isVehicleTypeUserSpecifiedForDebate(trip, intakeMsg);
  const dayCtx = resolveMarathonDayClarificationContext(trip, intakeMsg);

  const dreLines = scrubEvidenceLines(gr.drdre?.evidence, vehicleSpecified);
  const nepLines = scrubEvidenceLines(gr.neptune?.evidence, vehicleSpecified);
  const summary = scrubUnspecifiedVehicleNarrative(gr.debate_summary_zh ?? '', vehicleSpecified);

  const bullets: string[] = [];
  const marathonLike =
    dayCtx.userIntentDays === 1 ||
    /24\s*小时|24h|不间断|一口气/i.test(intakeMsg ?? '') ||
    /连续|24\s*小时|不可持续|疲劳/i.test(dreLines.join(' '));

  if (gr.drdre?.verdict === 'REJECT' || marathonLike) {
    bullets.push(buildMarathonSafetyRhythmZh(dayCtx));
  } else if (dreLines[0]) {
    bullets.push(`安全节奏：${dreLines[0]}`);
  }

  if (gr.neptune?.verdict === 'REPLACE' && nepLines[0]) {
    bullets.push(`可行替代：${nepLines[0]}`);
  }

  if (!vehicleSpecified) {
    bullets.push('租车：您尚未说明两驱/四驱，我们不会默认按两驱评估。');
  }

  if (bullets.length === 0 && summary) {
    const short = summary.length > 220 ? `${summary.slice(0, 217)}…` : summary;
    bullets.push(short);
  }

  return dedupeRepeatedClarificationParagraphs(bullets.join('\n\n'));
}

export function buildGuardianDebateClarificationQuestion(
  gate: GateResult,
  trip?: TripPlanRequest | null,
): ClarificationQuestion {
  const intakeMsg = resolveDebateIntakeUserMessage(trip);
  const intentFeasibility = buildUserIntentFeasibilityForDebate(trip, intakeMsg);
  const debateBody =
    formatGuardianDebateConclusionForUserZh(gate, trip) ||
    buildMarathonContinuousDriveClarificationPayload(trip, intakeMsg).message;
  /** 诉求/可行性在 metadata；question 正文仅保留「合议对照」三条（供 parseGuardianDebateSections） */
  const questionText = dedupeRepeatedClarificationParagraphs(debateBody);
  const sanitizedGuardianResults = gate.guardian_results
    ? sanitizeGuardianResultsForUnspecifiedVehicle(gate.guardian_results, trip ?? undefined)
    : undefined;

  if (isPeakSeasonWhaleTimeShiftScenario(trip, intakeMsg)) {
    const peakQ = structuredPayloadToClarificationQuestion(
      { ...buildPeakSeasonTimeShiftClarificationPayload(trip, intakeMsg), message: questionText },
      'peak_season_midnight_sun_whale_v1',
    );
    return {
      ...peakQ,
      id: 'guardian_debate_abu_reject_v1',
      metadata: {
        ...peakQ.metadata,
        source: 'guardian_debate_peak_season',
        gate_result: gate.gate_result,
        presentation: 'structured_peak_season_v1',
      },
    };
  }

  if (isFroad2wdComplianceScenario(trip, intakeMsg)) {
    const froadQ = structuredPayloadToClarificationQuestion(
      { ...buildFroad2wdComplianceClarificationPayload(trip, intakeMsg), message: questionText },
      'froad_2wd_compliance_v1',
    );
    return {
      ...froadQ,
      id: 'guardian_debate_abu_reject_v1',
      metadata: {
        ...froadQ.metadata,
        source: 'guardian_debate_froad_2wd',
        gate_result: gate.gate_result,
        presentation: 'structured_froad_v1',
        vehicle_type_specified: true,
      },
    };
  }

  const base = structuredPayloadToClarificationQuestion(
    {
      ...buildMarathonContinuousDriveClarificationPayload(trip, intakeMsg),
      message: questionText,
    },
    'guardian_debate_confirm_v1',
  );

  return {
    ...base,
    id: 'guardian_debate_abu_reject_v1',
    question: questionText,
    options: [
      { value: 'accept_neptune_alternative', label: '接受分段环岛方案后继续' },
      { value: 'change_vehicle_or_scope', label: '补充车型或调整天数/范围' },
      { value: 'restate_intent', label: '重新说明诉求' },
    ],
    metadata: {
      ...base.metadata,
      source: 'guardian_debate_user_confirm',
      gate_result: gate.gate_result,
      presentation: 'structured_debate_v1',
      vehicle_type_specified: isVehicleTypeUserSpecifiedForDebate(trip, intakeMsg),
      ...(sanitizedGuardianResults
        ? {
            guardian_personas: sanitizedGuardianResults,
            debate_summary_zh: sanitizedGuardianResults.debate_summary_zh,
          }
        : {}),
      ...(intentFeasibility
        ? {
            user_intent_feasibility: {
              echo_zh: intentFeasibility.user_intent_echo_zh,
              verdict: intentFeasibility.feasibility_verdict,
              summary_zh: intentFeasibility.feasibility_summary_zh,
            },
            show_user_intent_feasibility: true,
          }
        : {}),
    },
  };
}
