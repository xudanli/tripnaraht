import {
  assertScoreRiskCalibrationGate,
  buildScoreRiskCalibrationReport,
} from '../src/trips/decision/tot/score-risk-calibration.util';

function main(): void {
  const report = buildScoreRiskCalibrationReport();
  const errors = assertScoreRiskCalibrationGate(report);
  console.log(JSON.stringify(report, null, 2));
  if (errors.length > 0) {
    console.error('score-risk calibration gate FAILED:');
    for (const e of errors) console.error(`  - ${e}`);
    process.exit(1);
  }
  console.error(`score-risk calibration gate: OK (${report.scenarios.length} scenarios)`);
}

main();
