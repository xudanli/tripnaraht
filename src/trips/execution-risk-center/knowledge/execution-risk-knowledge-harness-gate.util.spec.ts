import {
  HARNESS_GATE_SMOKE_IDS,
  buildHarnessKnowledgeStackFromGateSnapshot,
} from './execution-risk-knowledge-harness-gate.util';
import {
  loadPackageCausalChainRows,
  loadPackageDefinitionRows,
  loadPackageInterventionActionRows,
  loadPackageSeverityRuleRows,
} from './execution-risk-knowledge.loader';

describe('execution-risk-knowledge-harness-gate', () => {
  it('exposes a non-empty smoke scenario set', () => {
    expect(HARNESS_GATE_SMOKE_IDS.length).toBeGreaterThanOrEqual(3);
  });

  it('builds a knowledge stack from package-shaped snapshot', async () => {
    const { knowledge } = buildHarnessKnowledgeStackFromGateSnapshot({
      versionId: 'erv_test',
      definitions: loadPackageDefinitionRows(),
      severityRules: loadPackageSeverityRuleRows(),
      causalChains: loadPackageCausalChainRows(),
      actions: loadPackageInterventionActionRows(),
    });

    const wind = await knowledge.findRiskDefinition('ENV-WIND-01');
    expect(wind?.canonicalCode).toBe('WEATHER_STRONG_WIND');
    const rules = await knowledge.findSeverityRules('ENV-WIND-01');
    expect(rules.length).toBeGreaterThan(0);
  });
});
