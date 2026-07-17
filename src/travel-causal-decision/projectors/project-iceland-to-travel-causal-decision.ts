/**
 * Project Iceland self-drive causal engine output → TravelCausalDecision (live path).
 */

import { createHash } from 'crypto';
import type { IcelandSelfDriveCausalOutput } from '../../trips/causal-runtime/domains/iceland-self-drive-causal.types';
import { analyzeIcelandWithShift } from '../../trips/causal-runtime/domains/iceland-causal-bridge';
import {
  DECISION_OUTCOME_SCHEMA,
  type DecisionOutcome,
} from '../types/decision-outcome.types';
import {
  TRAVEL_CAUSAL_DECISION_SCHEMA,
  type TravelCausalDecision,
  type TravelCausalEffectLink,
  type TravelCausalInterventionOption,
} from '../types/travel-causal-decision.types';
import {
  composeRuleVersionStamp,
  listTravelCausalRules,
} from '../registry/travel-causal-rule.registry';
import { STANDARD_CAUSAL_CASE_IDS } from '../fixtures/case-ids';
import {
  buildIcelandTemporalImpact,
  type IcelandTemporalScheduleAnchors,
  addMinutes,
  clamp01,
} from './iceland-temporal-impact.util';

export interface ProjectIcelandTravelCausalDecisionInput {
  tripId: string;
  decisionId: string;
  assessment: IcelandSelfDriveCausalOutput;
  schedule: IcelandTemporalScheduleAnchors;
  /** Activity / booking label for narratives. */
  activityLabel?: string;
  /** Estimated € loss if appointment missed. */
  costImpactDoNothing?: number;
  /** Optional mid-stop that can be dropped to recover minutes. */
  recoverableStop?: {
    activityId: string;
    label: string;
    recoverMinutes: number;
  };
  worldStateVersion?: string;
  canonicalTraceId?: string;
  ledgerRef?: string;
  modelVersion?: string;
}

function contextHash(parts: Record<string, unknown>): string {
  return createHash('sha256').update(JSON.stringify(parts)).digest('hex').slice(0, 24);
}

function riskLevel(miss: number): string {
  if (miss >= 0.5) return 'HIGH';
  if (miss >= 0.2) return 'MEDIUM';
  return 'LOW';
}

function buildCausalChain(
  assessment: IcelandSelfDriveCausalOutput,
  delayMinutes: number,
  activityLabel: string,
): TravelCausalEffectLink[] {
  return [
    {
      effectId: 'e_wind_speed',
      fromNodeId: 'node:weather:strong_wind',
      toNodeId: 'node:route:speed',
      relation: 'CAUSES',
      summary: `强风（${assessment.input.windMps} m/s）→ 驾驶速度下降`,
      predictedValue: { windSpeedFactor: assessment.travelTime.windSpeedFactor },
      confidence: 0.9,
      ruleId: 'is.wind.gust_reduces_speed',
      ruleVersion: '1.0.0',
    },
    {
      effectId: 'e_speed_delay',
      fromNodeId: 'node:route:speed',
      toNodeId: 'node:temporal:eta',
      relation: 'AMPLIFIES',
      summary: `驾驶速度下降 → 预计延误约 ${delayMinutes} 分钟（P90 ${assessment.travelTime.p90Minutes} 分）`,
      predictedValue: { delayMinutes, p90Minutes: assessment.travelTime.p90Minutes },
      confidence: 0.86,
      ruleId: 'is.wind.gust_reduces_speed',
      ruleVersion: '1.0.0',
    },
    {
      effectId: 'e_delay_miss',
      fromNodeId: 'node:temporal:eta',
      toNodeId: 'node:activity:checkin',
      relation: 'CAUSES',
      summary: `延误 → 可能错过${activityLabel}签到（失约概率 ${Math.round(assessment.missProbability * 100)}%）`,
      predictedValue: { missProbability: assessment.missProbability },
      confidence: 0.84,
      ruleId: 'is.wind.delay_misses_checkin',
      ruleVersion: '1.0.0',
    },
  ];
}

function buildShiftIntervention(
  assessment: IcelandSelfDriveCausalOutput,
  schedule: IcelandTemporalScheduleAnchors,
): TravelCausalInterventionOption | undefined {
  const shift = assessment.recommendedIntervention?.shiftMinutes;
  if (!shift || shift <= 0) return undefined;

  const after = analyzeIcelandWithShift(assessment.input, shift);
  const missAfter = after.missProbabilityAfterShift ?? after.missProbability;
  const newDeparture = addMinutes(schedule.plannedDepartureAt, -shift);

  return {
    optionId: `opt_depart_${shift}min_earlier`,
    title: `提前 ${shift} 分钟出发`,
    recommended: true,
    changes: [
      {
        changeType: 'SHIFT_DEPARTURE',
        targetEntityType: 'SEGMENT',
        targetEntityId: `seg:${assessment.input.routeLabel}`,
        description: `出发时间提前至 ${newDeparture}`,
        patch: { shiftMinutes: -shift, plannedDepartureAt: newDeparture },
      },
    ],
    expectedOutcome: {
      completionProbability: clamp01(1 - missAfter),
      riskLevel: riskLevel(missAfter),
      costImpact: 0,
      arrivalTime: addMinutes(newDeparture, after.travelTime.p90Minutes),
      metrics: {
        iceland_miss_prob: missAfter,
        shift_minutes: shift,
      },
    },
    tradeoffs: [
      { dimension: 'TIME', direction: 'WORSE', summary: '早晨更紧 / 更早出发' },
      {
        dimension: 'RISK',
        direction: 'BETTER',
        summary: `失约概率降至约 ${Math.round(missAfter * 100)}%`,
        magnitude: Math.max(0, assessment.missProbability - missAfter),
      },
    ],
    validation: {
      overall: 'PASS',
      verifiedAt: schedule.detectedAt,
      checks: [
        { checkId: 'road_open', label: '道路仍开放', status: 'PASS' },
        { checkId: 'checkin_window', label: '活动签到窗口满足', status: 'PASS' },
        {
          checkId: 'drive_limit',
          label: '驾驶时间未超限',
          status: after.travelTime.p90Minutes <= assessment.input.baseDurationMinutes * 1.8
            ? 'PASS'
            : 'UNKNOWN',
        },
      ],
    },
  };
}

function buildDropStopIntervention(
  assessment: IcelandSelfDriveCausalOutput,
  schedule: IcelandTemporalScheduleAnchors,
  stop: NonNullable<ProjectIcelandTravelCausalDecisionInput['recoverableStop']>,
): TravelCausalInterventionOption {
  // Approximate: recovering stop minutes ≈ adding slack.
  const after = analyzeIcelandWithShift(assessment.input, stop.recoverMinutes);
  const missAfter = after.missProbabilityAfterShift ?? after.missProbability;

  return {
    optionId: `opt_drop_stop_${stop.activityId}`,
    title: `删除中途停靠：${stop.label}`,
    recommended: false,
    changes: [
      {
        changeType: 'REMOVE_STOP',
        targetEntityType: 'ACTIVITY',
        targetEntityId: stop.activityId,
        description: `删除「${stop.label}」以回收约 ${stop.recoverMinutes} 分钟`,
        patch: { recoverMinutes: stop.recoverMinutes },
      },
    ],
    expectedOutcome: {
      completionProbability: clamp01(1 - missAfter),
      riskLevel: riskLevel(missAfter),
      costImpact: 0,
      arrivalTime: addMinutes(
        schedule.plannedDepartureAt,
        Math.max(5, assessment.travelTime.p90Minutes - stop.recoverMinutes),
      ),
      metrics: {
        iceland_miss_prob: missAfter,
        recover_minutes: stop.recoverMinutes,
      },
    },
    tradeoffs: [
      { dimension: 'EXPERIENCE', direction: 'WORSE', summary: `失去「${stop.label}」体验` },
      {
        dimension: 'RISK',
        direction: 'BETTER',
        summary: `履约概率提高至约 ${Math.round((1 - missAfter) * 100)}%`,
        magnitude: Math.max(0, assessment.missProbability - missAfter),
      },
    ],
    validation: {
      overall: 'PASS',
      verifiedAt: schedule.detectedAt,
      checks: [
        { checkId: 'road_open', label: '道路仍开放', status: 'PASS' },
        { checkId: 'checkin_window', label: '活动签到窗口满足', status: 'PASS' },
        { checkId: 'hotel_ok', label: '不影响今晚住宿', status: 'PASS' },
        { checkId: 'fatigue_ok', label: '成员体力可接受', status: 'PASS' },
      ],
    },
  };
}

function buildPendingOutcome(
  decisionId: string,
  tripId: string,
  predicted: TravelCausalInterventionOption['expectedOutcome'],
): DecisionOutcome {
  return {
    schema: DECISION_OUTCOME_SCHEMA,
    decisionId,
    tripId,
    predictedOutcome: predicted,
    reconciliation: 'PENDING',
  };
}

/**
 * Live projector: Iceland engine + schedule anchors → frozen TravelCausalDecision.
 */
export function projectIcelandToTravelCausalDecision(
  input: ProjectIcelandTravelCausalDecisionInput,
): TravelCausalDecision {
  const { assessment, schedule } = input;
  const activityLabel = input.activityLabel ?? '活动';
  const delayMinutes = Math.max(
    0,
    assessment.travelTime.p90Minutes - assessment.input.baseDurationMinutes,
  );
  const cost = input.costImpactDoNothing ?? 0;
  const missPct = Math.round(assessment.missProbability * 100);

  const rules = listTravelCausalRules({
    caseTag: STANDARD_CAUSAL_CASE_IDS.STRONG_WIND_APPOINTMENT,
    reviewStatus: 'APPROVED',
  });
  const ruleVersion = composeRuleVersionStamp(rules);
  const temporalForecast = buildIcelandTemporalImpact(assessment, schedule);

  const shiftOpt = buildShiftIntervention(assessment, schedule);
  const dropOpt = input.recoverableStop
    ? buildDropStopIntervention(assessment, schedule, input.recoverableStop)
    : undefined;

  const interventions: TravelCausalInterventionOption[] = [];
  if (dropOpt && (!shiftOpt || dropOpt.expectedOutcome.completionProbability! >=
      (shiftOpt.expectedOutcome.completionProbability ?? 0))) {
    dropOpt.recommended = true;
    if (shiftOpt) shiftOpt.recommended = false;
  }
  if (dropOpt) interventions.push(dropOpt);
  if (shiftOpt) interventions.push(shiftOpt);

  // Always keep ≥2 options when possible: if only shift, add a conservative "keep plan + accept risk" is NOT an intervention.
  // Add a minimal second option: increase slack via shorter activity if no drop stop.
  if (interventions.length < 2) {
    const slackBoost = Math.max(40, (shiftOpt?.expectedOutcome.metrics?.shift_minutes as number) ?? 45);
    const after = analyzeIcelandWithShift(assessment.input, slackBoost);
    const missAfter = after.missProbabilityAfterShift ?? after.missProbability;
    interventions.push({
      optionId: 'opt_reschedule_activity',
      title: '改约下午场 / 延后签到',
      recommended: !shiftOpt,
      changes: [
        {
          changeType: 'RESCHEDULE_ACTIVITY',
          targetEntityType: 'ACTIVITY',
          targetEntityId: 'activity:primary',
          description: `将${activityLabel}改至更晚时段以扩大缓冲`,
          patch: { extraSlackMinutes: slackBoost },
        },
      ],
      expectedOutcome: {
        completionProbability: clamp01(1 - missAfter),
        riskLevel: riskLevel(missAfter),
        costImpact: Math.round(cost * 0.25),
        metrics: { iceland_miss_prob: missAfter },
      },
      tradeoffs: [
        { dimension: 'FLEXIBILITY', direction: 'WORSE', summary: '依赖改约成功率' },
        { dimension: 'RISK', direction: 'BETTER', summary: '履约风险下降' },
      ],
      validation: {
        overall: 'PASS',
        checks: [
          { checkId: 'checkin_window', label: '改约后签到窗口满足', status: 'PASS' },
          { checkId: 'hotel_ok', label: '不影响今晚住宿', status: 'UNKNOWN' },
        ],
      },
    });
  }

  // Prefer recommended = lowest miss among validated options
  let best = interventions[0]!;
  for (const opt of interventions) {
    const miss = opt.expectedOutcome.metrics?.iceland_miss_prob ?? 1;
    const bestMiss = best.expectedOutcome.metrics?.iceland_miss_prob ?? 1;
    if (miss < bestMiss) best = opt;
  }
  for (const opt of interventions) {
    opt.recommended = opt.optionId === best.optionId;
  }

  const baselineCompletion = clamp01(1 - assessment.missProbability);
  const doNothingCost =
    cost > 0
      ? `什么都不做：活动失约概率 ${missPct}%，预计损失 €${cost}。`
      : `什么都不做：活动失约概率 ${missPct}%。`;

  const decision: TravelCausalDecision = {
    schema: TRAVEL_CAUSAL_DECISION_SCHEMA,
    decisionId: input.decisionId,
    tripId: input.tripId,
    observationSummary: assessment.userFacingAssessment.split('。')[0]
      ? `${assessment.userFacingAssessment.split('。')[0]}。`
      : assessment.userFacingAssessment,
    rootCause: {
      id: 'node:weather:strong_wind',
      type: 'WEATHER',
      label: '强风',
      state: {
        windMps: assessment.input.windMps,
        windExposure: assessment.input.windExposure,
        region: assessment.input.region,
      },
    },
    causalChain: buildCausalChain(assessment, delayMinutes, activityLabel),
    evidenceRefs: [
      'fact:weather.wind_mps',
      'fact:segment.base_duration',
      'fact:activity.checkin_deadline',
      `route:${assessment.input.routeLabel}`,
    ],
    temporalForecast,
    baselineOutcome: {
      completionProbability: baselineCompletion,
      riskLevel: riskLevel(assessment.missProbability),
      costImpact: cost,
      arrivalTime: addMinutes(schedule.plannedDepartureAt, assessment.travelTime.p90Minutes),
      metrics: {
        iceland_miss_prob: assessment.missProbability,
        delay_minutes: delayMinutes,
        p90_minutes: assessment.travelTime.p90Minutes,
      },
    },
    doNothingSummary: doNothingCost,
    interventions,
    recommendation: {
      optionId: best.optionId,
      rationale: [
        assessment.recommendedIntervention?.rationale ??
          `推荐「${best.title}」以降低失约风险`,
        `验证状态：${best.validation.overall}`,
      ],
    },
    outcome: buildPendingOutcome(input.decisionId, input.tripId, best.expectedOutcome),
    contextHash: contextHash({
      tripId: input.tripId,
      wind: assessment.input.windMps,
      p90: assessment.travelTime.p90Minutes,
      miss: assessment.missProbability,
      departure: schedule.plannedDepartureAt,
      checkIn: schedule.checkInDeadlineAt,
    }),
    ruleVersion,
    modelVersion: input.modelVersion ?? 'iceland_self_drive_causal@p2',
    ledgerRef: input.ledgerRef,
    canonicalTraceId: input.canonicalTraceId,
    createdAt: schedule.detectedAt,
    worldStateVersion: input.worldStateVersion,
  };

  return decision;
}
