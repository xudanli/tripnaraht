import {
  loadExecutionRiskKnowledgeFromPackage,
} from '../knowledge/execution-risk-knowledge.loader';

describe('execution-risk-knowledge.loader', () => {
  it('loads 104 definitions and indexes wind rules/chains/actions', () => {
    const snapshot = loadExecutionRiskKnowledgeFromPackage();

    expect(snapshot.definitions).toHaveLength(104);
    expect(snapshot.version).toBe('v1.0.0');
    expect(snapshot.status).toBe('DRAFT');

    const wind = snapshot.definitions.find((d) => d.knowledgeCode === 'ENV-WIND-01');
    expect(wind?.canonicalCode).toBe('WEATHER_STRONG_WIND');
    expect(wind?.isRootCause).toBe(true);

    const windRules = snapshot.severityRulesByCode.get('ENV-WIND-01') ?? [];
    expect(windRules.length).toBeGreaterThanOrEqual(5);
    expect(windRules[0].priority).toBeLessThanOrEqual(windRules[windRules.length - 1].priority);

    const windChains = snapshot.causalChainsByCode.get('ENV-WIND-01') ?? [];
    expect(windChains.length).toBeGreaterThanOrEqual(1);
    expect(windChains[0].rootCause.nodeType).toBe('ROOT_CAUSE');

    const action = snapshot.actionsByCode.get('ACT-TIME-EARLIER');
    expect(action?.actionCode).toBe('ACT-TIME-EARLIER');
  });
});
