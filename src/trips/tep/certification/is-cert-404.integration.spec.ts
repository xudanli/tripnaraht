import { loadIsCertRuntimeScenariosFromFile } from './is-cert-runtime.harness';
import { runIsCert404Scenario } from './is-cert-404.harness';

describe('IS-CERT-404 TEP / Canonical dedup', () => {
  const scenarios = loadIsCertRuntimeScenariosFromFile();
  const roadScenario = scenarios.find((s) => s.scenarioId === 'IS-CERT-301');

  it('single road event surfaces only TEP primary intervention', async () => {
    expect(roadScenario).toBeDefined();
    const result = await runIsCert404Scenario(roadScenario!);
    if (!result.passed) {
      throw new Error(`${result.scenarioId}: ${result.message}`);
    }
    expect(result.artifacts?.visibleInterventionIds).toHaveLength(1);
    expect(result.artifacts?.suppressedCount).toBe(2);
    expect(result.artifacts?.dedupKey).toContain('ROAD_SEGMENT_UNAVAILABLE');
  });
});
