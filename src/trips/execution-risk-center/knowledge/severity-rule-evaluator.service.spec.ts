import { SeverityRuleEvaluatorService } from './severity-rule-evaluator.service';
import { ExecutionRiskKnowledgeRepositoryService } from './execution-risk-knowledge.repository';
import { loadExecutionRiskKnowledgeFromPackage } from './execution-risk-knowledge.loader';

describe('SeverityRuleEvaluatorService', () => {
  const knowledge = {
    findSeverityRules: jest.fn(async (code: string) => {
      const snapshot = loadExecutionRiskKnowledgeFromPackage();
      return snapshot.severityRulesByCode.get(code) ?? [];
    }),
  } as unknown as ExecutionRiskKnowledgeRepositoryService;

  const evaluator = new SeverityRuleEvaluatorService(knowledge);

  it('matches ENV-WIND-01 REPLAN rule for 18 m/s sustained wind', async () => {
    const result = await evaluator.evaluate('ENV-WIND-01', {
      metrics: { WIND_SUSTAINED_MPS: 18 },
    });
    expect(result?.matchedRuleId).toBe('SR-ENV-WIND-01-REPLAN-15');
    expect(result?.executionGate).toBe('REPLAN_REQUIRED');
    expect(result?.level).toBe('HIGH');
  });

  it('matches STOP rule at 20 m/s', async () => {
    const result = await evaluator.evaluate('ENV-WIND-01', {
      metrics: { WIND_SUSTAINED_MPS: 20 },
    });
    expect(result?.matchedRuleId).toBe('SR-ENV-WIND-01-STOP-20');
    expect(result?.executionGate).toBe('STOP');
  });

  it('returns null when metric missing', async () => {
    const result = await evaluator.evaluate('ENV-WIND-01', { metrics: {} });
    expect(result).toBeNull();
  });

  it('matches ROAD-CLOSE-01 STOP for confirmed closure', async () => {
    const result = await evaluator.evaluate('ROAD-CLOSE-01', {
      metrics: { ROAD_STATUS: 'CLOSED_CONFIRMED' },
    });
    expect(result?.matchedRuleId).toBe('SR-ROAD-CLOSE-01-STOP-CONFIRMED');
    expect(result?.executionGate).toBe('STOP');
  });

  it('matches official yellow warning over lower numeric wind', async () => {
    const result = await evaluator.evaluate('ENV-WIND-01', {
      metrics: { WIND_SUSTAINED_MPS: 12, OFFICIAL_WARNING_LEVEL: 'YELLOW' },
    });
    expect(result?.matchedRuleId).toBe('SR-ENV-WIND-01-REPLAN-OFFICIAL-YELLOW');
    expect(result?.executionGate).toBe('REPLAN_REQUIRED');
  });
});
