import { projectEnvironmentEventToRisk } from '../adapters/environment-event-risk.adapter';
import { harnessWindEnvironmentEvent } from '../harness/execution-risk-p0.harness.util';
import { ActiveRiskKnowledgeEnrichmentService } from './active-risk-knowledge-enrichment.service';
import { ExecutionRiskKnowledgeRepositoryService } from './execution-risk-knowledge.repository';
import { SeverityRuleEvaluatorService } from './severity-rule-evaluator.service';
import { SeverityHysteresisService } from './severity-hysteresis.service';
import { loadExecutionRiskKnowledgeFromPackage } from './execution-risk-knowledge.loader';
import { filterActiveRisks, mergeRiskProjections } from '../utils/risk-merge.util';

describe('ActiveRiskKnowledgeEnrichmentService', () => {
  const snapshot = loadExecutionRiskKnowledgeFromPackage();
  const knowledge = {
    findRiskDefinition: jest.fn(async (code: string) =>
      snapshot.definitions.find((d) => d.knowledgeCode === code) ?? null,
    ),
    findSeverityRules: jest.fn(async (code: string) =>
      snapshot.severityRulesByCode.get(code) ?? [],
    ),
    getActiveKnowledgeVersion: jest.fn(async () => ({
      version: 'v1.0.0',
      status: 'DRAFT' as const,
    })),
  } as unknown as ExecutionRiskKnowledgeRepositoryService;

  const enrichment = new ActiveRiskKnowledgeEnrichmentService(
    knowledge,
    new SeverityRuleEvaluatorService(knowledge),
    new SeverityHysteresisService(),
  );

  it('enriches wind environment projection with knowledgeCode and matchedRuleId', async () => {
    const projection = projectEnvironmentEventToRisk(
      harnessWindEnvironmentEvent({ severity: 'green' }),
    );
    expect(projection.observedMetrics?.WIND_SUSTAINED_MPS).toBe(18);

    const enriched = await enrichment.enrichProjections([projection]);
    expect(enriched[0]?.knowledgeCode).toBe('ENV-WIND-01');
    expect(enriched[0]?.matchedRuleId).toBe('SR-ENV-WIND-01-REPLAN-15');
    expect(enriched[0]?.isRootCause).toBe(true);
    expect(enriched[0]?.executionGate).toBe('REPLAN_REQUIRED');

    const merged = filterActiveRisks(mergeRiskProjections(enriched));
    const risks = await enrichment.enrichRisks(merged);
    expect(risks[0]?.knowledgeCode).toBe('ENV-WIND-01');
    expect(risks[0]?.matchedRuleId).toBe('SR-ENV-WIND-01-REPLAN-15');
    expect(risks[0]?.rootEventId).toBe('env-wind-001');
  });

  it('ER-AC-005: official yellow warning overrides sub-threshold wind reading', async () => {
    const projection = projectEnvironmentEventToRisk(
      harnessWindEnvironmentEvent({
        severity: 'yellow',
        description: 'IMO wind warning: sustained winds 15-20 m/s expected across south coast',
      }),
    );
    projection.observedMetrics = { WIND_SUSTAINED_MPS: 12, OFFICIAL_WARNING_LEVEL: 'YELLOW' };

    const enriched = await enrichment.enrichProjections([projection]);
    expect(enriched[0]?.matchedRuleId).toBe('SR-ENV-WIND-01-REPLAN-OFFICIAL-YELLOW');
    expect(enriched[0]?.executionGate).toBe('REPLAN_REQUIRED');
    expect(enriched[0]?.severityState).toBe('KNOWN');
  });

  it('ER-AC-006: missing wind metric returns UNKNOWN with dataGaps', async () => {
    const projection = projectEnvironmentEventToRisk(
      harnessWindEnvironmentEvent({
        severity: 'green',
        description: 'Calm conditions, no wind data available',
      }),
    );
    projection.observedMetrics = {};

    const enriched = await enrichment.enrichProjections([projection]);
    expect(enriched[0]?.severityState).toBe('UNKNOWN');
    expect(enriched[0]?.dataGaps).toContain('WIND_SUSTAINED_MPS');
    expect(enriched[0]?.matchedRuleId).toBeUndefined();
  });
});
