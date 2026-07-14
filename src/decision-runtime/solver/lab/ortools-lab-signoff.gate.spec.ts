import {
  evaluateOrToolsShadowMetricsGate,
  foldLabSignoffChecks,
  validatePythonLabSignoffReport,
} from './ortools-lab-signoff.gate';

describe('ortools-lab-signoff.gate', () => {
  it('fails when writeAttemptedTotal > 0', () => {
    const checks = evaluateOrToolsShadowMetricsGate({
      writeAttemptedTotal: 1,
      forbiddenEdgeViolationSum: 0,
      runsTotal: 2,
    });
    expect(foldLabSignoffChecks(checks).verdict).toBe('FAIL');
  });

  it('passes clean metrics and refuses authority promotion', () => {
    const checks = evaluateOrToolsShadowMetricsGate({
      writeAttemptedTotal: 0,
      forbiddenEdgeViolationSum: 0,
      runsTotal: 3,
    });
    const report = foldLabSignoffChecks(checks);
    expect(report.verdict).toBe('PASS');
    expect(report.authoritativePromotion).toBe(false);
    expect(report.nativeCpSat).toBe(false);
  });

  it('validates python signoff report envelope', () => {
    const folded = validatePythonLabSignoffReport({
      schemaId: 'tripnara.ortools_lab_signoff@v1',
      verdict: 'PASS',
      authoritativePromotion: false,
      nativeCpSat: false,
      checks: [{ id: 'seed_repro', pass: true }],
    });
    expect(folded.verdict).toBe('PASS');
  });
});
