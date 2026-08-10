/**
 * L1 PASSIVE Surface + Utility — Useful / Unnecessary / Ignore / Action Quality（非 CTR）。
 */

import type { TemporalScenarioId } from '../pilot/scenario-temporal-readiness.util';
import type { InterventionCandidateV1 } from '../intervention-intelligence/intervention-candidate.util';
import type { UserAttentionContextV1 } from './user-attention-context.util';
import type { SelectSurfacePilotResult } from './select-surface-pilot.util';
import { decideDeliveryChannel } from './delivery-policy.util';
import {
  createSurfaceSilenceState,
  decideStaySilent,
  type SurfaceSilenceStateV1,
} from './surface-silence.util';
import {
  createProactiveSurfaceEvent,
  recordSilentSurfaceDecision,
  type ProactiveSurfaceEventV1,
} from './proactive-surface-event.util';

export type L1SurfaceAttemptResult = {
  event: ProactiveSurfaceEventV1;
  silenceState: SurfaceSilenceStateV1;
  surfaced: boolean;
};

/**
 * 执行一次 L1 PASSIVE 尝试（打开 App 时）。
 */
export function attemptL1PassiveSurface(input: {
  entry: SelectSurfacePilotResult;
  candidate: InterventionCandidateV1;
  attention: UserAttentionContextV1;
  silenceState?: SurfaceSilenceStateV1;
  now?: string;
}): L1SurfaceAttemptResult {
  const silenceState =
    input.silenceState ??
    createSurfaceSilenceState({
      tripId: input.candidate.tripId,
      riskEventKey: input.candidate.riskEventKey,
    });

  const delivery = decideDeliveryChannel({
    entry: input.entry,
    candidate: input.candidate,
    attention: input.attention,
    l1UtilityPassed: false,
    notificationReadinessPassed: false,
  });

  const silence = decideStaySilent({
    state: silenceState,
    candidate: input.candidate,
    attention: input.attention,
    delivery,
    now: input.now,
  });

  if (silence.staySilent) {
    return {
      surfaced: false,
      silenceState: silence.nextState,
      event: recordSilentSurfaceDecision({
        scenarioId: input.candidate.scenarioId,
        tripId: input.candidate.tripId,
        candidateId: input.candidate.candidateId,
        silenceReasonZh: silence.reasonZh,
      }),
    };
  }

  return {
    surfaced: true,
    silenceState: silence.nextState,
    event: createProactiveSurfaceEvent({
      scenarioId: input.candidate.scenarioId,
      tripId: input.candidate.tripId,
      candidateId: input.candidate.candidateId,
      channel: 'L1_PASSIVE_IN_APP',
      surfacedAt: input.now,
    }),
  };
}

export type L1SurfaceLabel =
  | 'USEFUL_SURFACE'
  | 'UNNECESSARY_SURFACE'
  | 'IGNORED'
  | 'ACTION_QUALITY_GOOD'
  | 'ACTION_QUALITY_POOR';

export type L1SurfaceEvalEpisodeV1 = {
  episodeId: string;
  scenarioId: TemporalScenarioId;
  surfaced: boolean;
  /** 人工/观测标签 */
  label: L1SurfaceLabel;
  /** 后续决策/行动/结果是否改善 */
  decisionImproved?: boolean;
  actionImproved?: boolean;
  outcomeImproved?: boolean;
};

export type L1SurfaceUtilityReportV1 = {
  scenarioId: TemporalScenarioId;
  n: number;
  usefulRate: number;
  unnecessaryRate: number;
  ignoreRate: number;
  actionQualityGoodRate: number;
  /** 明确：不以 CTR 作为主指标 */
  ctrForbiddenAsPrimaryMetric: true;
  decisionImproveDelta: number;
  actionImproveDelta: number;
  outcomeImproveDelta: number;
  passed: boolean;
  reasonsZh: string[];
  allowL2Canary: boolean;
};

/**
 * L1 效用：该出现/不该出现/沉默质量 + 后续 Decision/Action/Outcome。
 */
export function evaluateL1SurfaceUtility(input: {
  scenarioId: TemporalScenarioId;
  episodes: L1SurfaceEvalEpisodeV1[];
  minSamples?: number;
  maxUnnecessaryRate?: number;
  minUsefulAmongSurfaced?: number;
  minOutcomeImprove?: number;
}): L1SurfaceUtilityReportV1 {
  const minN = input.minSamples ?? 5;
  const rows = input.episodes.filter((e) => e.scenarioId === input.scenarioId);
  const n = rows.length;
  const surfaced = rows.filter((e) => e.surfaced);
  const silent = rows.filter((e) => !e.surfaced);

  const rate = (xs: L1SurfaceEvalEpisodeV1[], lab: L1SurfaceLabel) =>
    xs.length === 0 ? 0 : xs.filter((e) => e.label === lab).length / xs.length;

  const usefulRate = rate(surfaced, 'USEFUL_SURFACE');
  const unnecessaryRate = rate(surfaced, 'UNNECESSARY_SURFACE');
  const ignoreRate = rate(surfaced, 'IGNORED');
  const actionQualityGoodRate = rate(surfaced, 'ACTION_QUALITY_GOOD');

  const improve = (
    xs: L1SurfaceEvalEpisodeV1[],
    key: 'decisionImproved' | 'actionImproved' | 'outcomeImproved',
  ) =>
    xs.length === 0
      ? 0
      : xs.filter((e) => e[key] === true).length / xs.length;

  const decisionImproveDelta =
    improve(surfaced, 'decisionImproved') - improve(silent, 'decisionImproved');
  const actionImproveDelta =
    improve(surfaced, 'actionImproved') - improve(silent, 'actionImproved');
  const outcomeImproveDelta =
    improve(surfaced, 'outcomeImproved') - improve(silent, 'outcomeImproved');

  const reasonsZh: string[] = [];
  if (n < minN) reasonsZh.push(`样本不足 ${n} < ${minN}`);
  if (unnecessaryRate > (input.maxUnnecessaryRate ?? 0.35)) {
    reasonsZh.push(`Unnecessary Surface 过高 ${unnecessaryRate.toFixed(2)}`);
  }
  if (surfaced.length > 0 && usefulRate < (input.minUsefulAmongSurfaced ?? 0.5)) {
    reasonsZh.push(`Useful Surface 过低 ${usefulRate.toFixed(2)}`);
  }
  if (outcomeImproveDelta < (input.minOutcomeImprove ?? 0.05)) {
    reasonsZh.push(
      `Outcome 改善不足 Δ=${outcomeImproveDelta.toFixed(2)}（DoD：主动出现须改善结果）`,
    );
  }
  if (decisionImproveDelta < 0 || actionImproveDelta < 0) {
    reasonsZh.push('Decision/Action 相对沉默对照未改善');
  }

  const passed = reasonsZh.length === 0;
  if (passed) {
    reasonsZh.push(
      'L1 Utility 通过：该出现时出现、不该出现时能沉默，且改善 Decision/Action/Outcome；可申请小范围 L2 Canary',
    );
  }

  return {
    scenarioId: input.scenarioId,
    n,
    usefulRate,
    unnecessaryRate,
    ignoreRate,
    actionQualityGoodRate,
    ctrForbiddenAsPrimaryMetric: true,
    decisionImproveDelta,
    actionImproveDelta,
    outcomeImproveDelta,
    passed,
    reasonsZh,
    allowL2Canary: passed,
  };
}
