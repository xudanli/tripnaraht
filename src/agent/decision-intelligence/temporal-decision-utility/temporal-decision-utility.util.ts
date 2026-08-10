/**
 * TemporalDecisionUtility — 评价 Temporal 信息是否改善决策质量。
 * Accurate Prediction ≠ Useful Intervention：准不等于有用。
 */

import type { TemporalScenarioId } from '../pilot/scenario-temporal-readiness.util';

export const TEMPORAL_DECISION_UTILITY_SCHEMA =
  'nara.temporal_decision_utility@v1' as const;

export type TemporalUtilityEpisodeV1 = {
  episodeId: string;
  scenarioId: TemporalScenarioId;
  /** 是否向用户暴露了 Temporal（对照臂为 false） */
  temporalShown: boolean;
  decisionCompleted: boolean;
  /** 行动是否更及时（相对 deadline / onset） */
  actionTimingImproved: boolean;
  /** 是否减少事后纠正 */
  correctionReduced: boolean;
  /** 后悔是否更低（true=更好） */
  regretReduced: boolean;
  /** 旅行 outcome 是否更好 */
  outcomeImproved: boolean;
};

export type TemporalDecisionUtilityV1 = {
  schemaId: typeof TEMPORAL_DECISION_UTILITY_SCHEMA;
  version: 1;
  scenarioId: TemporalScenarioId;
  shownN: number;
  controlN: number;
  deltaCompletion: number;
  deltaActionTiming: number;
  deltaCorrection: number;
  deltaRegret: number;
  deltaOutcome: number;
  utilityScore: number;
  passed: boolean;
  accuratePredictionIsNotUsefulIntervention: true;
  reasonsZh: string[];
};

function rate(
  rows: TemporalUtilityEpisodeV1[],
  pick: (e: TemporalUtilityEpisodeV1) => boolean,
): number {
  if (rows.length === 0) return 0;
  return rows.filter(pick).length / rows.length;
}

/**
 * 对照「看到 Temporal」vs「未看到」的决策效用。
 */
export function evaluateTemporalDecisionUtility(input: {
  scenarioId: TemporalScenarioId;
  episodes: TemporalUtilityEpisodeV1[];
  minShown?: number;
  minControl?: number;
  minUtilityScore?: number;
  minDeltaCompletion?: number;
  minDeltaTiming?: number;
}): TemporalDecisionUtilityV1 {
  const minShown = input.minShown ?? 5;
  const minControl = input.minControl ?? 5;
  const minScore = input.minUtilityScore ?? 0.55;
  const scoped = input.episodes.filter((e) => e.scenarioId === input.scenarioId);
  const shown = scoped.filter((e) => e.temporalShown);
  const control = scoped.filter((e) => !e.temporalShown);

  const deltaCompletion =
    rate(shown, (e) => e.decisionCompleted) -
    rate(control, (e) => e.decisionCompleted);
  const deltaActionTiming =
    rate(shown, (e) => e.actionTimingImproved) -
    rate(control, (e) => e.actionTimingImproved);
  const deltaCorrection =
    rate(shown, (e) => e.correctionReduced) -
    rate(control, (e) => e.correctionReduced);
  const deltaRegret =
    rate(shown, (e) => e.regretReduced) -
    rate(control, (e) => e.regretReduced);
  const deltaOutcome =
    rate(shown, (e) => e.outcomeImproved) -
    rate(control, (e) => e.outcomeImproved);

  /** 加权：timing/regret/outcome 更重 */
  const utilityScore = Math.max(
    0,
    Math.min(
      1,
      0.5 +
        deltaCompletion * 0.15 +
        deltaActionTiming * 0.25 +
        deltaCorrection * 0.15 +
        deltaRegret * 0.2 +
        deltaOutcome * 0.25,
    ),
  );

  const reasonsZh: string[] = [];
  if (shown.length < minShown) {
    reasonsZh.push(`展示臂样本不足 ${shown.length} < ${minShown}`);
  }
  if (control.length < minControl) {
    reasonsZh.push(`对照臂样本不足 ${control.length} < ${minControl}`);
  }
  if (deltaCompletion < (input.minDeltaCompletion ?? 0)) {
    reasonsZh.push(
      `Decision Completion 未改善 Δ=${deltaCompletion.toFixed(2)}`,
    );
  }
  if (deltaActionTiming < (input.minDeltaTiming ?? 0.05)) {
    reasonsZh.push(
      `Action Timing 改善不足 Δ=${deltaActionTiming.toFixed(2)}`,
    );
  }
  if (deltaRegret < 0) {
    reasonsZh.push(`Regret 变差 Δ=${deltaRegret.toFixed(2)}`);
  }
  if (deltaOutcome < 0) {
    reasonsZh.push(`Outcome 变差 Δ=${deltaOutcome.toFixed(2)}`);
  }
  if (utilityScore < minScore) {
    reasonsZh.push(`utilityScore ${utilityScore.toFixed(2)} < ${minScore}`);
  }

  const passed = reasonsZh.length === 0;
  if (passed) {
    reasonsZh.push(
      'Temporal 信息相对对照改善了及时性/后悔/结果质量（准≠有用已用效用验证）',
    );
  } else {
    reasonsZh.push(
      'Accurate Prediction ≠ Useful Intervention：预测准不等于干预有用；效用未过',
    );
  }

  return {
    schemaId: TEMPORAL_DECISION_UTILITY_SCHEMA,
    version: 1,
    scenarioId: input.scenarioId,
    shownN: shown.length,
    controlN: control.length,
    deltaCompletion,
    deltaActionTiming,
    deltaCorrection,
    deltaRegret,
    deltaOutcome,
    utilityScore,
    passed,
    accuratePredictionIsNotUsefulIntervention: true,
    reasonsZh,
  };
}
