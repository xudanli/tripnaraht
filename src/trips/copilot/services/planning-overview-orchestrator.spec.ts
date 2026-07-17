import { PageAIContractRegistry, PageContractNotFoundError } from './page-ai-contract.registry';
import { PageInsightOrchestratorService } from './page-insight-orchestrator.service';
import { PageInsightContextHashService } from './page-insight-context-hash.service';
import { PageInsightCacheService } from './page-insight-cache.service';
import { PageInsightFeedbackStore } from './page-insight-feedback.store';
import { PageInsightNarrativeService } from './page-insight-narrative.service';

describe('PLANNING_OVERVIEW registry + orchestrator', () => {
  it('is live', () => {
    const registry = new PageAIContractRegistry();
    expect(registry.get('PLANNING_OVERVIEW').pageContractVersion).toBe(
      'planning_overview@1.0',
    );
    expect(registry.get('EXECUTION_HOME').pageContractVersion).toBe(
      'execution_home@1.0',
    );
  });

  it('evaluate returns INTERVENTION with navigation actions', async () => {
    const overviewBuilder = {
      build: jest.fn(async () => ({
        authoritative: {
          tripSnapshot: { tripVersion: 'v1' },
          relevantWorldState: { worldStateVersion: 'none' },
          constraintAssessments: [],
          decisionProblems: [],
          selectedEntities: [],
          availableActions: [],
          pageFocus: {
            pageId: 'PLANNING_OVERVIEW',
            lifecycle: 'PLANNING',
            selectedRefs: [],
          },
        },
        versions: { relevantTripProjectionVersion: 'v1' },
        gate: { ok: true, missing: [] },
        severity: 'BLOCKING',
        openProblemCount: 1,
        mustConfirmCount: 1,
        importantChoiceCount: 0,
        feasibilityMustHandle: 0,
        feasibilitySuggestAdjust: 0,
        gateExecuteBlocked: false,
        topProblem: {
          problemId: 'dp_vehicle',
          title: '确认车型',
          scope: { tripId: 't1' },
          decisionCase: { uiGroup: 'MUST_CONFIRM', domain: 'TRANSPORT' },
        },
        topBlockerTitle: '确认车型',
        unlockHint: '先确认车型，系统才能完成道路验证。',
        vehicleRelatedOpen: true,
        routeRelatedOpen: false,
        lodgingRelatedOpen: false,
        allowedFactTokens: ['1', '确认车型', '车型', '道路验证', '先确认车型，系统才能完成道路验证。'],
      })),
    };

    const orch = new PageInsightOrchestratorService(
      new PageAIContractRegistry(),
      new PageInsightContextHashService(),
      new PageInsightCacheService(),
      {} as never,
      { build: jest.fn() } as never,
      { build: jest.fn() } as never,
      overviewBuilder as never,
      { build: jest.fn() } as never,
      new PageInsightNarrativeService(),
      new PageInsightFeedbackStore(),
    );

    const res = await orch.evaluate('trip_1', {
      pageId: 'PLANNING_OVERVIEW',
      pageMode: 'PLANNING_OVERVIEW',
      insightScope: 'TRIP',
      lifecycle: 'PLANNING',
      forceRefresh: true,
    });

    expect(res.insight.mode).toBe('INTERVENTION');
    expect(res.evaluation.overviewMustConfirmCount).toBe(1);
    expect(res.insight.actions.some((a) => a.kind === 'NAVIGATION')).toBe(true);
    expect(res.insight.actions.every((a) => a.kind !== 'COMMAND')).toBe(true);
  });
});
