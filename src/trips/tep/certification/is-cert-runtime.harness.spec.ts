import {
  loadIsCertRuntimeScenariosFromFile,
  runIsCertRuntimeHarness,
} from './is-cert-runtime.harness';

describe('IS-CERT runtime harness (TEP Hook → DecisionProblem → Repair)', () => {
  const scenarios = loadIsCertRuntimeScenariosFromFile();

  it('runs IS-CERT-301 … IS-CERT-405 golden scenarios', () => {
    const report = runIsCertRuntimeHarness(scenarios);
    const failed = report.results.filter((r) => !r.passed);
    if (failed.length > 0) {
      const details = failed.map((f) => `${f.scenarioId}: ${f.message}`).join('\n');
      throw new Error(`IS-CERT runtime failures:\n${details}`);
    }
    expect(report.passed).toBe(scenarios.length);
    expect(report.failed).toBe(0);
  });

  it.each(scenarios.map((s) => [s.scenarioId, s]))(
    '%s passes individually',
    (_id, scenario) => {
      const report = runIsCertRuntimeHarness([scenario]);
      expect(report.results[0]?.passed).toBe(true);
    },
  );
});
