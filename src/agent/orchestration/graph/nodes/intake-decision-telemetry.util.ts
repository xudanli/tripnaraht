/**
 * Intake → Decision Telemetry 桥接
 *
 * 将 INTAKE 澄清选择转为 intelligence-grade 决策结构样本（冰岛优先）。
 */

import type { RouteAndRunRequestDto } from '../../../dto/route-and-run.dto';
import type { OrchestratorState, TripPlanRequest } from '../../../interfaces/trip-plan.interface';
import type { DecisionTelemetryEvent, DecisionTelemetryCandidate } from '../../../../trips/decision/telemetry/decision-telemetry.types';
import type { DecisionContextLayer } from '../../../../trips/decision/telemetry/decision-context.types';
import type { CandidateCounterfactualProjection } from '../../../../trips/decision/telemetry/decision-counterfactual.types';
import { buildFroadHighlandIntentSignals } from '../../../utils/froad-intake-signals.util';
import { stripSystemMessageBlocksForIntakeNl } from '../../../utils/trip-plan-intake-vehicle.util';
import { deriveSeasonContextZh } from '../../../utils/trip-season-context.util';
import {
  buildFroad2wdComplianceClarificationPayload,
  buildMarathonContinuousDriveClarificationPayload,
  buildPeakSeasonTimeShiftClarificationPayload,
} from '../../../utils/structured-intake-clarification.util';

export interface IntakeClarificationTelemetryParams {
  request: RouteAndRunRequestDto;
  state: OrchestratorState;
  questionId: string;
  chosenOptionIds: string[];
  optionsSnapshot?: Array<{ value?: string; label?: string; metadata?: Record<string, unknown> }>;
  tripPlanRequest?: TripPlanRequest;
  systemRecommendationOptionId?: string;
  userReasoning?: string;
}

type OptionRow = { value: string; label: string };

const FROAD_COUNTERFACTUALS: Record<string, CandidateCounterfactualProjection> = {
  UPGRADE_VEHICLE_TO_4WD: {
    projected_outcome: { satisfaction: 4.3, trip_friction_score: 0.25 },
    utility_delta_vs_chosen: 0.1,
    narrative_zh: '升级四驱后可按原 F 路方案行驶，驾驶焦虑与合规风险显著下降。',
    causal_factor_deltas: [{ factor_id: 'driving_anxiety', direction: 'decreases', magnitude: 0.5 }],
  },
  ACCEPT_NEPTUNE_DETOUR: {
    projected_outcome: { satisfaction: 3.8, trip_friction_score: 0.45 },
    utility_delta_vs_chosen: -0.05,
    narrative_zh: '走 26 北段替补路线可保留 2WD，但增加行驶时间与路况不确定性。',
    causal_factor_deltas: [{ factor_id: 'winter_weather', direction: 'increases', magnitude: 0.3 }],
  },
  SWITCH_GUIDE_MODE: {
    projected_outcome: { satisfaction: 4.5, trip_friction_score: 0.15 },
    utility_delta_vs_chosen: 0.2,
    narrative_zh: '向导模式将驾驶与 F 路风险转移给本地履约方，适合首次冰岛用户。',
    causal_factor_deltas: [{ factor_id: 'driving_anxiety', direction: 'decreases', magnitude: 0.62 }],
  },
  RESTATE_INTENT: {
    projected_outcome: { satisfaction: 3.0, trip_friction_score: 0.5 },
    narrative_zh: '重新澄清意图将延迟规划，但可避免错误车型/路线绑定。',
  },
};

const MARATHON_COUNTERFACTUALS: Record<string, CandidateCounterfactualProjection> = {
  ACCEPT_SEGMENTED_RING: {
    projected_outcome: { satisfaction: 4.2, trip_friction_score: 0.3 },
    narrative_zh: '分段环岛保留完整路线且符合安全节奏，摩擦低于 24h 连续驾驶。',
  },
  EXTEND_DAYS: {
    projected_outcome: { satisfaction: 4.0, trip_friction_score: 0.35 },
    narrative_zh: '延长天数降低单日驾驶负荷，时间成本上升。',
  },
  SHRINK_SCOPE: {
    projected_outcome: { satisfaction: 3.6, trip_friction_score: 0.2 },
    narrative_zh: '南岸精华方案可行但覆盖范围缩小，适合时间极紧用户。',
  },
  RESTATE_INTENT: {
    projected_outcome: { satisfaction: 3.0, trip_friction_score: 0.45 },
    narrative_zh: '需重新对齐「24h 连续」与日历天数语义。',
  },
};

const PEAK_SEASON_COUNTERFACTUALS: Record<string, CandidateCounterfactualProjection> = {
  LOCK_MIDNIGHT_SUN_WHALE_SLOT: {
    projected_outcome: { satisfaction: 4.4, trip_friction_score: 0.2 },
    narrative_zh: '午夜阳光场避开白天人潮，次日延迟出发消化疲劳。',
    causal_factor_deltas: [{ factor_id: 'crowd_aversion', direction: 'decreases', magnitude: 0.55 }],
  },
  KEEP_DAYTIME_SLOT: {
    projected_outcome: { satisfaction: 3.2, trip_friction_score: 0.55 },
    narrative_zh: '白天场次人潮密集，体验摩擦显著上升。',
    causal_factor_deltas: [{ factor_id: 'crowd_aversion', direction: 'increases', magnitude: 0.6 }],
  },
  RESTATE_INTENT: {
    projected_outcome: { satisfaction: 3.0, trip_friction_score: 0.4 },
    narrative_zh: '需重新确认观鲸日期与时段偏好。',
  },
};

function normalizeChosen(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.map(String).filter(Boolean);
  if (typeof raw === 'string' && raw.trim()) return [raw.trim()];
  return [];
}

function resolveOptionsForQuestion(
  questionId: string,
  trip: TripPlanRequest | undefined,
  intakeMsg: string | undefined,
  snapshot?: IntakeClarificationTelemetryParams['optionsSnapshot'],
): OptionRow[] {
  if (Array.isArray(snapshot) && snapshot.length > 0) {
    return snapshot
      .map((o) => ({
        value: String(o.value ?? ''),
        label: String(o.label ?? o.value ?? ''),
      }))
      .filter((o) => o.value);
  }

  const msg = intakeMsg ?? '';
  if (questionId === 'froad_2wd_compliance_v1') {
    return (
      buildFroad2wdComplianceClarificationPayload(trip, msg).suggested_operations?.map((op) => ({
        value: op.action,
        label: op.label,
      })) ?? []
    );
  }
  if (questionId === 'marathon_continuous_drive_v1') {
    return (
      buildMarathonContinuousDriveClarificationPayload(trip, msg).suggested_operations?.map((op) => ({
        value: op.action,
        label: op.label,
      })) ?? []
    );
  }
  if (questionId === 'peak_season_midnight_sun_whale_v1') {
    return (
      buildPeakSeasonTimeShiftClarificationPayload(trip, msg).suggested_operations?.map((op) => ({
        value: op.action,
        label: op.label,
      })) ?? []
    );
  }
  return [];
}

function counterfactualForOption(
  questionId: string,
  optionId: string,
): CandidateCounterfactualProjection | undefined {
  const maps: Record<string, Record<string, CandidateCounterfactualProjection>> = {
    froad_2wd_compliance_v1: FROAD_COUNTERFACTUALS,
    marathon_continuous_drive_v1: MARATHON_COUNTERFACTUALS,
    peak_season_midnight_sun_whale_v1: PEAK_SEASON_COUNTERFACTUALS,
  };
  return maps[questionId]?.[optionId];
}

function buildContextLayer(trip: TripPlanRequest | undefined, intakeMsg?: string): DecisionContextLayer {
  const nl = stripSystemMessageBlocksForIntakeNl(intakeMsg ?? trip?.message ?? '');
  const froad = buildFroadHighlandIntentSignals(nl);
  const country = trip?.ontology_context?.destination?.country_code ?? 'IS';
  const month = trip?.date_range?.start_date
    ? new Date(`${trip.date_range.start_date}T12:00:00.000Z`).getUTCMonth() + 1
    : undefined;

  const experience: DecisionContextLayer['travelExperienceLevel'] =
    /首次|第一次|从没|没去过/i.test(nl) ? 'first_time' : /二刷|再访|去过/i.test(nl) ? 'returning' : 'first_time';

  return {
    capturedAt: new Date().toISOString(),
    weather: froad?.melt_season_risk_zh
      ? { severity: 'high', condition: 'melt_season', road_closure_risk: true }
      : { severity: 'medium', condition: 'iceland_variable' },
    travelExperienceLevel: experience,
    timePressure: /赶|紧急|明天|24\s*小时/i.test(nl) ? 'high' : 'medium',
    budgetElasticity: /预算|省钱|便宜/i.test(nl) ? 'rigid' : 'moderate',
    season: deriveSeasonContextZh(trip ?? undefined),
    month,
    destinationSignals: {
      country_code: country,
      f_road: froad?.primary_froad,
      highland_crossing: Boolean(froad),
    },
  };
}

function reasonCodesForQuestion(questionId: string, chosen: string[]): string[] {
  const base: Record<string, string[]> = {
    froad_2wd_compliance_v1: ['F_ROAD', 'VEHICLE_COMPLIANCE', 'HIGHLANDS'],
    marathon_continuous_drive_v1: ['MARATHON_DRIVE', 'PACE_RISK'],
    peak_season_midnight_sun_whale_v1: ['AVOID_CROWD', 'PEAK_SEASON'],
    early_warning_relaxations: ['EARLY_WARNING', 'RISK_ACKNOWLEDGMENT'],
    plan_gen_empty_draft_relax_constraints: ['PLAN_GEN', 'CONSTRAINT_RELAX'],
  };
  const codes = [...(base[questionId] ?? ['INTAKE_CLARIFICATION'])];
  if (chosen.includes('SWITCH_GUIDE_MODE')) codes.push('DRIVING_ANXIETY');
  if (chosen.includes('proceed_at_own_risk')) codes.push('SELF_ASSUME_RISK');
  if (chosen.includes('UPGRADE_VEHICLE_TO_4WD')) codes.push('SELF_DRIVE');
  return codes;
}

export function buildIntakeClarificationTelemetryEvent(
  params: IntakeClarificationTelemetryParams,
): DecisionTelemetryEvent | null {
  const tripId = params.request.trip_id?.trim() ?? params.tripPlanRequest?.trip_id?.trim();
  if (!tripId) return null;

  const chosen = params.chosenOptionIds.filter(Boolean);
  if (chosen.length === 0) return null;

  const intakeMsg =
    params.request.message ??
    (params.state.metadata as { intake_user_message?: string } | undefined)?.intake_user_message;
  const options = resolveOptionsForQuestion(
    params.questionId,
    params.tripPlanRequest,
    intakeMsg,
    params.optionsSnapshot,
  );
  if (options.length < 2) return null;

  const chosenId = chosen[0];
  const candidates: DecisionTelemetryCandidate[] = options.map((op) => ({
    optionId: op.value,
    label: op.label,
    rejected: !chosen.includes(op.value),
    rejectionReasonCodes: chosen.includes(op.value) ? undefined : ['NOT_SELECTED'],
    counterfactual: counterfactualForOption(params.questionId, op.value) ?? {
      projected_outcome: { trip_friction_score: 0.4 },
      narrative_zh: `若选择「${op.label}」，路线与摩擦结构将与当前不同。`,
    },
  }));

  const sysRec = params.systemRecommendationOptionId;
  const alignment =
    sysRec && chosenId
      ? sysRec === chosenId
        ? 1
        : 0
      : undefined;

  return {
    tripId,
    userId: params.request.user_id,
    countryCode: params.tripPlanRequest?.ontology_context?.destination?.country_code ?? 'IS',
    decisionPoint: 'RISK_ACKNOWLEDGMENT',
    decisionStage: 'READINESS',
    decisionSource: 'USER',
    context: buildContextLayer(params.tripPlanRequest, intakeMsg),
    decision: {
      optionId: chosenId,
      action: chosen.includes('proceed_at_own_risk') ? 'ALLOW' : 'ADJUST',
      selectedAt: new Date().toISOString(),
    },
    candidates,
    reasons: {
      reasonCodes: reasonCodesForQuestion(params.questionId, chosen),
      userReasoning: params.userReasoning,
      rejectionByOption: Object.fromEntries(
        options
          .filter((o) => !chosen.includes(o.value))
          .map((o) => [o.value, ['NOT_SELECTED']]),
      ),
    },
    systemRecommendation: sysRec
      ? { optionId: sysRec, rationale: '系统推荐最高分解冲突选项' }
      : undefined,
    alignmentScore: alignment,
    source: 'user',
    metadata: {
      intake_question_id: params.questionId,
      request_id: params.state.request_id,
      orchestration_step: 'INTAKE',
    },
  };
}

export async function emitIntakeClarificationTelemetry(
  record: ((event: DecisionTelemetryEvent) => Promise<unknown>) | undefined,
  params: IntakeClarificationTelemetryParams,
): Promise<void> {
  if (!record) return;
  const event = buildIntakeClarificationTelemetryEvent(params);
  if (!event) return;
  try {
    await record(event);
  } catch {
    // best-effort：不阻塞 INTAKE
  }
}

/** 从 clarification_answers 批量发射 telemetry */
export async function emitIntakeClarificationAnswersTelemetry(
  record: ((event: DecisionTelemetryEvent) => Promise<unknown>) | undefined,
  params: {
    request: RouteAndRunRequestDto;
    state: OrchestratorState;
    clarificationAnswers: Array<{ questionId?: string; value?: unknown }>;
    tripPlanRequest?: TripPlanRequest;
    resolveOptionsSnapshot?: (questionId: string) => OptionRow[] | undefined;
    resolveSystemRecommendation?: (questionId: string) => string | undefined;
  },
): Promise<void> {
  if (!record || !params.clarificationAnswers.length) return;

  const knownIds = new Set([
    'froad_2wd_compliance_v1',
    'marathon_continuous_drive_v1',
    'peak_season_midnight_sun_whale_v1',
    'early_warning_relaxations',
    'plan_gen_empty_draft_relax_constraints',
  ]);

  for (const ans of params.clarificationAnswers) {
    const qid = String(ans.questionId ?? '');
    if (!knownIds.has(qid)) continue;
    const chosen = normalizeChosen(ans.value);
    const snap = params.resolveOptionsSnapshot?.(qid);
    await emitIntakeClarificationTelemetry(record, {
      request: params.request,
      state: params.state,
      questionId: qid,
      chosenOptionIds: chosen,
      optionsSnapshot: snap,
      tripPlanRequest: params.tripPlanRequest,
      systemRecommendationOptionId: params.resolveSystemRecommendation?.(qid),
    });
  }
}
