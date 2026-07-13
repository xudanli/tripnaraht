import {
  assertScenarioExpectations,
  createHarnessKnowledgeStackFromSnapshot,
  loadPackageHarnessFile,
  runPackageHarnessScenario,
} from './package-harness.runner';
import { PACKAGE_HARNESS_SCENARIO_IDS_11_20 } from './package-harness.types';

describe('Execution Risk Package Harness (SH-HUMAN-001 … SH-SCHED-005)', () => {
  const harness = loadPackageHarnessFile();
  const { knowledge, enrichment } = createHarnessKnowledgeStackFromSnapshot();

  const scenarios = harness.scenarios.filter((s) =>
    (PACKAGE_HARNESS_SCENARIO_IDS_11_20 as readonly string[]).includes(s.scenarioId),
  );

  it('loads 10 Sprint-2 harness scenarios', () => {
    expect(scenarios).toHaveLength(10);
  });

  it.each(scenarios.map((s) => [s.scenarioId, s]))(
    '%s: expected knowledge codes and clusters',
    async (scenarioId, scenario) => {
      const result = await runPackageHarnessScenario(scenario, enrichment, knowledge);
      const failures = assertScenarioExpectations(scenario, result);

      if (failures.length > 0) {
        throw new Error(
          `${scenarioId} failures:\n${failures.join('\n')}\nfound: ${result.knowledgeCodes.join(', ')}`,
        );
      }

      expect(result.activeRisks.length).toBeGreaterThan(0);
    },
    30_000,
  );

  it('SH-SCHED-005: independent wind and illness clusters (AC-002)', async () => {
    const scenario = scenarios.find((s) => s.scenarioId === 'SH-SCHED-005')!;
    const result = await runPackageHarnessScenario(scenario, enrichment, knowledge);

    const windCluster = result.clusters.find((c) => c.primaryKnowledgeCode === 'ENV-WIND-01');
    const illnessCluster = result.clusters.find((c) => c.primaryKnowledgeCode === 'MEMBER-INJURY-01');

    expect(windCluster).toBeDefined();
    expect(illnessCluster).toBeDefined();
    expect(windCluster!.relatedRiskIds).not.toEqual(illnessCluster!.relatedRiskIds);

    const windMembers = result.activeRisks
      .filter((r) => windCluster!.relatedRiskIds.includes(r.id))
      .map((r) => r.knowledgeCode);
    const illnessMembers = result.activeRisks
      .filter((r) => illnessCluster!.relatedRiskIds.includes(r.id))
      .map((r) => r.knowledgeCode);

    expect(windMembers).toContain('ROAD-CROSSWIND-01');
    expect(illnessMembers).toContain('MEMBER-VULNERABLE-02');
    expect(windMembers).not.toContain('MEMBER-INJURY-01');
    expect(illnessMembers).not.toContain('ENV-WIND-01');
  });
});
