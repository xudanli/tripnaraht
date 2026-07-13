import {
  assertScenarioExpectations,
  createHarnessKnowledgeStackFromSnapshot,
  loadPackageHarnessFile,
  runPackageHarnessScenario,
} from './package-harness.runner';
import { PACKAGE_HARNESS_SCENARIO_IDS_1_10 } from './package-harness.types';

describe('Execution Risk Package Harness (SH-ENV-001 … SH-ROAD-005)', () => {
  const harness = loadPackageHarnessFile();
  const { knowledge, enrichment } = createHarnessKnowledgeStackFromSnapshot();

  const scenarios = harness.scenarios.filter((s) =>
    (PACKAGE_HARNESS_SCENARIO_IDS_1_10 as readonly string[]).includes(s.scenarioId),
  );

  it('loads 10 Sprint-1 harness scenarios', () => {
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
      for (const expected of scenario.expected.activeRisks) {
        const risk = result.activeRisks.find((r) => r.knowledgeCode === expected.knowledgeCode);
        expect(risk).toBeDefined();
        if (risk?.generationMode === 'DIRECT_DETECTION' && risk.matchedRuleId) {
          expect(risk.matchedRuleId).toMatch(/^SR-/);
        }
      }
    },
    30_000,
  );

  it('SH-ENV-001: wind root triggers causal derivation', async () => {
    const scenario = scenarios.find((s) => s.scenarioId === 'SH-ENV-001')!;
    const result = await runPackageHarnessScenario(scenario, enrichment, knowledge);
    expect(result.knowledgeCodes).toEqual(
      expect.arrayContaining(['ENV-WIND-01', 'ROAD-CROSSWIND-01', 'BOOK-TIME-01']),
    );
    const wind = result.activeRisks.find((r) => r.knowledgeCode === 'ENV-WIND-01');
    expect(wind?.matchedRuleId).toBe('SR-ENV-WIND-01-REPLAN-15');
  });

  it('SH-ROAD-001: road closure matches ROAD-CLOSE-01 severity rule', async () => {
    const scenario = scenarios.find((s) => s.scenarioId === 'SH-ROAD-001')!;
    const result = await runPackageHarnessScenario(scenario, enrichment, knowledge);
    const road = result.activeRisks.find((r) => r.knowledgeCode === 'ROAD-CLOSE-01');
    expect(road?.matchedRuleId).toBe('SR-ROAD-CLOSE-01-STOP-CONFIRMED');
    expect(road?.executionGate).toBe('STOP');
  });
});
