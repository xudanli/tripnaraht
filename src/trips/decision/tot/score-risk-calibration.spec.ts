import {
  assertScoreRiskCalibrationGate,
  buildScoreRiskCalibrationReport,
} from './score-risk-calibration.util';

describe('scoreRisk threshold calibration (P0 gate)', () => {
  it('golden scenarios satisfy bounds and monotonicity', () => {
    const report = buildScoreRiskCalibrationReport();
    const errors = assertScoreRiskCalibrationGate(report);
    expect(errors).toEqual([]);
    expect(report.monotonicity.tightSlackScoresLowerThanBuffered).toBe(true);
    expect(report.monotonicity.lowToleranceScoresLowerThanHighTolerance).toBe(true);
  });

  it('exports RISK_CONSTANTS for audit trail', () => {
    const report = buildScoreRiskCalibrationReport();
    expect(report.constants.SLACK_THRESHOLD_MIN).toBe(30);
    expect(report.contractVersion).toBe('score-risk-calibration/v3');
    expect(report.countryClosureScenarios.length).toBe(3);
    expect(report.replayClosureScenarios.length).toBeGreaterThanOrEqual(6);
    expect(report.replayBuckets.length).toBeGreaterThanOrEqual(4);
  });
});
