import { loadIsCertScenariosFromFile, runIsCertHarness } from './is-cert.harness';

describe('IS-CERT harness (TEP planning validator)', () => {
  const scenarios = loadIsCertScenariosFromFile();

  it('runs IS-CERT-001 … IS-CERT-202 golden scenarios', () => {
    const report = runIsCertHarness(scenarios, { forcePackRules: true });
    const failed = report.results.filter((r) => !r.passed);
    if (failed.length > 0) {
      const details = failed.map((f) => `${f.scenarioId}: ${f.message}`).join('\n');
      throw new Error(`IS-CERT failures:\n${details}`);
    }
    expect(report.passed).toBe(scenarios.length);
    expect(report.failed).toBe(0);
  });

  it.each(scenarios.map((s) => [s.scenarioId, s]))(
    '%s passes individually',
    (_id, scenario) => {
      const report = runIsCertHarness([scenario], { forcePackRules: true });
      expect(report.results[0]?.passed).toBe(true);
    },
  );
});
