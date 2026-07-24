/**
 * scoreRisk 离线阈值校准报告（与 POMDP refinement 阈值报告并列，供 DS 复盘）。
 */

import { scoreRisk } from './dimension-scorers';
import { RISK_CONSTANTS } from './scoring-constants';
import {
  SCORE_RISK_CALIBRATION_SCENARIOS,
  type ScoreRiskCalibrationScenario,
} from './score-risk-calibration.fixture';
import { SCORE_RISK_COUNTRY_CLOSURE_SCENARIOS } from './score-risk-country-closure.fixture';
import {
  buildScoreRiskReplayClosureScenarios,
  summarizeReplayScoresByCountry,
  type ScoreRiskReplayBucketSummary,
} from './score-risk-replay-calibration.util';
import { COUNTRY_DECISION_CLOSURE_FIXTURES } from '../evaluation/e2e-cases/registry';

export type ScoreRiskCalibrationScenarioResult = {
  id: string;
  description: string;
  score: number;
  metrics: Record<string, number>;
  bounds: { minScore?: number; maxScore?: number };
  boundsOk: boolean;
};

export type ScoreRiskCalibrationReport = {
  generatedAt: string;
  contractVersion: 'score-risk-calibration/v3';
  constants: typeof RISK_CONSTANTS;
  scenarios: ScoreRiskCalibrationScenarioResult[];
  countryClosureScenarios: ScoreRiskCalibrationScenarioResult[];
  replayClosureScenarios: ScoreRiskCalibrationScenarioResult[];
  replayBuckets: ScoreRiskReplayBucketSummary[];
  monotonicity: {
    tightSlackScoresLowerThanBuffered: boolean;
    lowToleranceScoresLowerThanHighTolerance: boolean;
    replayStressLowerThanStable?: boolean;
  };
  pomdpCalibrationCompanion: {
    script: 'npm run calibrate:pomdp-thresholds -- <log-file>',
    metricsScript: 'npm run metrics:pomdp -- <log-file>',
  };
};

function evaluateScenario(scenario: ScoreRiskCalibrationScenario): ScoreRiskCalibrationScenarioResult {
  const { score, metrics } = scoreRisk(scenario.world, scenario.plan, scenario.optimizationResult);
  const boundsOk =
    (scenario.minScore === undefined || score >= scenario.minScore) &&
    (scenario.maxScore === undefined || score <= scenario.maxScore);
  return {
    id: scenario.id,
    description: scenario.description,
    score,
    metrics,
    bounds: { minScore: scenario.minScore, maxScore: scenario.maxScore },
    boundsOk,
  };
}

export function buildScoreRiskCalibrationReport(): ScoreRiskCalibrationReport {
  const scenarios = SCORE_RISK_CALIBRATION_SCENARIOS.map(evaluateScenario);
  const countryClosureScenarios = SCORE_RISK_COUNTRY_CLOSURE_SCENARIOS.map(evaluateScenario);
  const replayClosureScenarios = buildScoreRiskReplayClosureScenarios(COUNTRY_DECISION_CLOSURE_FIXTURES).map(
    evaluateScenario,
  );
  const replayBuckets = summarizeReplayScoresByCountry(replayClosureScenarios, COUNTRY_DECISION_CLOSURE_FIXTURES);

  const byId = Object.fromEntries(scenarios.map((s) => [s.id, s.score]));
  const tight = byId['tight-slack-storm-window'] ?? 0;
  const buffered = byId['buffered-robust-plan'] ?? 1;
  const lowTol = byId['high-activity-risk-low-tolerance'] ?? 0;
  const highTol = byId['baseline-relaxed-medium-tolerance'] ?? 1;

  const replayF208 = replayClosureScenarios.find((s) => s.id.includes('storm-f208'))?.score;
  const replayRing = replayClosureScenarios.find((s) => s.id.includes('ring-stable'))?.score;

  return {
    generatedAt: new Date().toISOString(),
    contractVersion: 'score-risk-calibration/v3',
    constants: RISK_CONSTANTS,
    scenarios,
    countryClosureScenarios,
    replayClosureScenarios,
    replayBuckets,
    monotonicity: {
      tightSlackScoresLowerThanBuffered: tight < buffered,
      lowToleranceScoresLowerThanHighTolerance: lowTol < highTol,
      ...(replayF208 !== undefined && replayRing !== undefined
        ? { replayStressLowerThanStable: replayF208 < replayRing }
        : {}),
    },
    pomdpCalibrationCompanion: {
      script: 'npm run calibrate:pomdp-thresholds -- <log-file>',
      metricsScript: 'npm run metrics:pomdp -- <log-file>',
    },
  };
}

export function assertScoreRiskCalibrationGate(report: ScoreRiskCalibrationReport): string[] {
  const errors: string[] = [];
  for (const s of [
    ...report.scenarios,
    ...report.countryClosureScenarios,
    ...report.replayClosureScenarios,
  ]) {
    if (!s.boundsOk) {
      errors.push(
        `${s.id}: score=${s.score.toFixed(4)} outside bounds min=${s.bounds.minScore ?? '-'} max=${s.bounds.maxScore ?? '-'}`,
      );
    }
  }
  if (!report.monotonicity.tightSlackScoresLowerThanBuffered) {
    errors.push('monotonicity: tight-slack-storm-window should score lower than buffered-robust-plan');
  }
  if (!report.monotonicity.lowToleranceScoresLowerThanHighTolerance) {
    errors.push(
      'monotonicity: high-activity-risk-low-tolerance should score lower than baseline-relaxed-medium-tolerance',
    );
  }
  if (report.monotonicity.replayStressLowerThanStable === false) {
    errors.push('monotonicity: replay F208 stress should score lower than ring-stable');
  }
  return errors;
}
