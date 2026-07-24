/**
 * INTAKE 结构化澄清短路 → 注入确定性三人格合议（不跑 RESEARCH/PLAN，但下发 guardian_personas）。
 */

import type { RouteAndRunRequestDto } from '../dto/route-and-run.dto';
import type { GateResult, OrchestratorState, TripPlanRequest } from '../interfaces/trip-plan.interface';
import { extractGuardianDebateUserIntentAnchors } from './guardian-debate-user-intent-anchor.util';
import {
  buildGuardianDebateClarificationQuestion,
} from './guardian-debate-user-surface.util';
import {
  fuseGuardianDebateVerdictIntoGate,
  type DebateGateFusionReason,
} from './guardian-debate-gate-fusion.util';
import {
  buildDeterministicFroad2wdGuardianResults,
  buildFroadHighlandIntentSignals,
  isFroad2wdComplianceScenario,
} from './froad-intake-signals.util';
import {
  buildDeterministicMarathonGuardianResults,
  resolveTripPlanNlMessage,
} from './marathon-intake-signals.util';
import {
  buildDeterministicPeakSeasonGuardianResults,
  buildPeakSeasonTimeShiftSignals,
  isPeakSeasonWhaleTimeShiftScenario,
} from './peak-season-time-shift-intake.util';
import { stripSystemMessageBlocksForIntakeNl } from './trip-plan-intake-vehicle.util';

function resolveIntakeUserMessage(
  state: OrchestratorState,
  request: RouteAndRunRequestDto,
): string | undefined {
  const fromMeta = (state.metadata as { intake_user_message?: string } | undefined)?.intake_user_message;
  return (request.message ?? fromMeta ?? state.trip_plan_request?.message)?.trim() || undefined;
}

/** 用户 NL「24h 环岛」优先于 Trip 档案天数（与澄清卡一致） */
export function resolveMarathonUserIntentDays(
  trip: TripPlanRequest | undefined,
  intakeUserMessage?: string | null,
): number {
  const nl = stripSystemMessageBlocksForIntakeNl(String(intakeUserMessage ?? resolveTripPlanNlMessage(trip)));
  if (/24\s*小时|24h|24\s*h|不间断|一口气/i.test(nl) && /环岛|绕岛|一号公路|ring\s*road/i.test(nl)) {
    return 1;
  }
  if (typeof trip?.days === 'number' && trip.days > 0) return trip.days;
  return 1;
}

function baseIntakeDebateGate(): GateResult {
  return {
    gate_result: 'ADJUST_REQUIRED',
    violations: [],
    required_adjustments: [],
    confidence: 0.72,
  };
}

function attachGuardianDebateToState(
  state: OrchestratorState,
  gate: GateResult,
  fusionReason: DebateGateFusionReason,
): void {
  const fusion = fuseGuardianDebateVerdictIntoGate(gate, state.trip_plan_request);
  state.gate_result = fusion.gate;
  state.clarification_questions = [
    buildGuardianDebateClarificationQuestion(fusion.gate, state.trip_plan_request),
  ];
  state.metadata = {
    ...(state.metadata ?? {}),
    debate_merged_before_plan_gen: true,
    debate_gate_fusion: fusion.fused ? fusion.reason ?? fusionReason : fusionReason,
  } as OrchestratorState['metadata'];
}

/**
 * 极昼马拉松 / F 路 2WD / 旺季错峰等 INTAKE 短路：写入 gate.guardian_results + 三人格澄清卡。
 * @returns 是否已处理（调用方应 terminal_clarification）
 */
export function enrichStateForIntakeGuardianDebateShortCircuit(
  state: OrchestratorState,
  request: RouteAndRunRequestDto,
): boolean {
  const meta = state.metadata as Record<string, unknown> | undefined;
  const trip = state.trip_plan_request;
  if (!trip) return false;

  const intakeMsg = resolveIntakeUserMessage(state, request);

  if (meta?.marathon_intake_clarification_short_circuit === true) {
    const anchors =
      trip.guardian_debate_trip_context?.user_intent_anchors ??
      extractGuardianDebateUserIntentAnchors(intakeMsg ?? resolveTripPlanNlMessage(trip));
    if (!anchors?.midnight_sun_continuous_drive) return false;
    const intentDays = resolveMarathonUserIntentDays(trip, intakeMsg);
    state.trip_plan_request = {
      ...trip,
      days: intentDays,
      ...(intakeMsg ? { message: intakeMsg } : {}),
      guardian_debate_trip_context: {
        ...(trip.guardian_debate_trip_context ?? {}),
        user_intent_anchors: anchors,
      },
    };
    const tripForDebate = state.trip_plan_request;
    const base = baseIntakeDebateGate();
    const gate: GateResult = {
      ...base,
      guardian_results: buildDeterministicMarathonGuardianResults(base, anchors, tripForDebate, intakeMsg),
    };
    attachGuardianDebateToState(state, gate, 'marathon_replace_confirm');
    return true;
  }

  if (meta?.froad_2wd_intake_clarification_short_circuit === true && isFroad2wdComplianceScenario(trip, intakeMsg)) {
    const froadSignals =
      buildFroadHighlandIntentSignals(intakeMsg ?? '') ??
      ({ f_road_highland_crossing: true, interpretation_zh: 'F 路高地穿越' } as const);
    const base = baseIntakeDebateGate();
    const gate: GateResult = {
      ...base,
      guardian_results: buildDeterministicFroad2wdGuardianResults(base, froadSignals, trip),
    };
    attachGuardianDebateToState(state, gate, 'abu_reject');
    return true;
  }

  if (
    meta?.peak_season_time_shift_intake_short_circuit === true &&
    isPeakSeasonWhaleTimeShiftScenario(trip, intakeMsg)
  ) {
    const peakSignals =
      buildPeakSeasonTimeShiftSignals(intakeMsg ?? '', new Date().getFullYear(), trip) ??
      ({
        peak_season_crowd_avoidance: true,
        whale_watching_husavik: true,
        overnight_stay_akureyri: true,
        interpretation_zh: '旺季观鲸错峰',
      } as const);
    const base = baseIntakeDebateGate();
    const gate: GateResult = {
      ...base,
      guardian_results: buildDeterministicPeakSeasonGuardianResults(base, peakSignals),
    };
    attachGuardianDebateToState(state, gate, 'marathon_replace_confirm');
    return true;
  }

  return false;
}
