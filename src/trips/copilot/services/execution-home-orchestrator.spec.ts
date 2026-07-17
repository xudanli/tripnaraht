import { PageAIContractRegistry, PageContractNotFoundError } from './page-ai-contract.registry';
import { PageInsightOrchestratorService } from './page-insight-orchestrator.service';
import { PageInsightContextHashService } from './page-insight-context-hash.service';
import { PageInsightCacheService } from './page-insight-cache.service';
import { PageInsightFeedbackStore } from './page-insight-feedback.store';
import { PageInsightNarrativeService } from './page-insight-narrative.service';

describe('EXECUTION_HOME registry + orchestrator', () => {
  it('is live', () => {
    const registry = new PageAIContractRegistry();
    expect(registry.get('EXECUTION_HOME').pageContractVersion).toBe(
      'execution_home@1.0',
    );
    expect(() => registry.get('ITINERARY_EDITOR')).toThrow(PageContractNotFoundError);
  });

  it('evaluate returns SILENT when on track', async () => {
    const execBuilder = {
      build: jest.fn(async () => ({
        authoritative: {
          tripSnapshot: { tripVersion: 'v1' },
          relevantWorldState: { worldStateVersion: 'none' },
          constraintAssessments: [],
          decisionProblems: [],
          selectedEntities: [],
          availableActions: [],
          pageFocus: {
            pageId: 'EXECUTION_HOME',
            lifecycle: 'TRAVELING',
            selectedRefs: [],
          },
        },
        versions: { relevantTripProjectionVersion: 'v1' },
        gate: { ok: true, missing: [] },
        severity: 'CLEAR',
        delayMinutes: 0,
        blockingDecisionCount: 0,
        highRiskCount: 0,
        missWindowRisk: false,
        allowedFactTokens: ['0'],
      })),
    };

    const orch = new PageInsightOrchestratorService(
      new PageAIContractRegistry(),
      new PageInsightContextHashService(),
      new PageInsightCacheService(),
      {} as never,
      { build: jest.fn() } as never,
      { build: jest.fn() } as never,
      { build: jest.fn() } as never,
      execBuilder as never,
      new PageInsightNarrativeService(),
      new PageInsightFeedbackStore(),
    );

    const res = await orch.evaluate('trip_1', {
      pageId: 'EXECUTION_HOME',
      pageMode: 'EXECUTION_HOME',
      insightScope: 'EXECUTION',
      lifecycle: 'TRAVELING',
      forceRefresh: false,
    });

    expect(res.insight.mode).toBe('SILENT');
    expect(res.evaluation.execSeverity).toBe('CLEAR');
    expect(res.evaluation.modeReason).toBe('EXEC_ON_TRACK');
  });

  it('evaluate returns INTERVENTION with risk actions', async () => {
    const execBuilder = {
      build: jest.fn(async () => ({
        authoritative: {
          tripSnapshot: { tripVersion: 'v1' },
          relevantWorldState: { worldStateVersion: 'none' },
          constraintAssessments: [],
          decisionProblems: [],
          selectedEntities: [],
          availableActions: [],
          pageFocus: {
            pageId: 'EXECUTION_HOME',
            lifecycle: 'TRAVELING',
            selectedRefs: [],
          },
        },
        versions: { relevantTripProjectionVersion: 'v1' },
        gate: { ok: true, missing: [] },
        severity: 'INTERVENTION',
        delayMinutes: 40,
        missWindowRisk: true,
        nextActivityLabel: '蓝湖',
        topRisk: {
          riskId: 'risk_stop',
          level: 'CRITICAL',
          executionGate: 'STOP',
          summary: '前方道路封闭，不可继续原路线。',
        },
        blockingDecisionCount: 0,
        highRiskCount: 1,
        allowedFactTokens: [
          '40',
          '蓝湖',
          '前方道路封闭，不可继续原路线。',
          'CRITICAL',
          '晚点',
          '分钟',
        ],
      })),
    };

    const orch = new PageInsightOrchestratorService(
      new PageAIContractRegistry(),
      new PageInsightContextHashService(),
      new PageInsightCacheService(),
      {} as never,
      { build: jest.fn() } as never,
      { build: jest.fn() } as never,
      { build: jest.fn() } as never,
      execBuilder as never,
      new PageInsightNarrativeService(),
      new PageInsightFeedbackStore(),
    );

    const res = await orch.evaluate('trip_1', {
      pageId: 'EXECUTION_HOME',
      pageMode: 'EXECUTION_HOME',
      insightScope: 'EXECUTION',
      lifecycle: 'TRAVELING',
      forceRefresh: true,
    });

    expect(res.insight.mode).toBe('INTERVENTION');
    expect(res.evaluation.execSeverity).toBe('INTERVENTION');
    expect(res.evaluation.execTopRiskId).toBe('risk_stop');
    expect(res.insight.actions.map((a) => a.actionType)).toEqual(
      expect.arrayContaining(['ACKNOWLEDGE_RISK', 'PREVIEW_PLAN_CHANGE']),
    );
  });
});
