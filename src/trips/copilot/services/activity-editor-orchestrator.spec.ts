import { PageAIContractRegistry, PageContractNotFoundError } from './page-ai-contract.registry';
import { PageInsightContextHashService } from './page-insight-context-hash.service';
import { ACTIVITY_EDITOR_PAGE_AI_CONTRACT } from '../contracts/page-ai-contracts';
import type { ClientPageState } from '../contracts/page-insight.types';
import { PageInsightOrchestratorService } from './page-insight-orchestrator.service';
import { PageInsightCacheService } from './page-insight-cache.service';
import { PageInsightFeedbackStore } from './page-insight-feedback.store';
import { PageInsightNarrativeService } from './page-insight-narrative.service';

describe('PageAIContractRegistry activity editor', () => {
  const registry = new PageAIContractRegistry();

  it('returns ACTIVITY_EDITOR live contract', () => {
    expect(registry.get('ACTIVITY_EDITOR').pageId).toBe('ACTIVITY_EDITOR');
    expect(registry.get('ACTIVITY_EDITOR').pageContractVersion).toBe(
      'activity_editor@1.0',
    );
  });

  it('lists progressive live pages; ITINERARY_EDITOR remains stub', () => {
    expect(registry.get('ITINERARY_DAY_EDITOR').pageContractVersion).toBe(
      'itinerary_day_editor@1.1',
    );
    expect(registry.get('PLANNING_OVERVIEW').pageContractVersion).toBe(
      'planning_overview@1.0',
    );
    expect(() => registry.get('ITINERARY_EDITOR')).toThrow(PageContractNotFoundError);
    expect(registry.get('EXECUTION_HOME').pageContractVersion).toBe(
      'execution_home@1.0',
    );
  });
});

describe('ACTIVITY_EDITOR contextHash', () => {
  const service = new PageInsightContextHashService();
  const contract = ACTIVITY_EDITOR_PAGE_AI_CONTRACT;

  const baseClient: ClientPageState = {
    pageId: 'ACTIVITY_EDITOR',
    pageMode: 'ACTIVITY_EDITOR',
    insightScope: 'ACTIVITY',
    lifecycle: 'PLANNING',
    selectedRefs: [
      { entityType: 'POI', entityId: '42' },
      { entityType: 'DAY', entityId: '3' },
    ],
    viewport: { selectedDayIndex: 3 },
    draftRevision: 1,
  };

  const versions = {
    relevantTripProjectionVersion: 'plan_v1',
    relevantWorldStateVersion: 'ws_1',
    draftRevision: 1,
  };

  it('changes when pageMode or insightScope changes', () => {
    const a = service.compute(contract, baseClient, versions);
    const b = service.compute(
      contract,
      { ...baseClient, pageMode: 'ITINERARY_DAY_EDITOR' as never },
      versions,
    );
    const c = service.compute(
      contract,
      { ...baseClient, insightScope: 'ITINERARY_DAY' },
      versions,
    );
    expect(a).not.toEqual(b);
    expect(a).not.toEqual(c);
  });
});

describe('PageInsightOrchestratorService ACTIVITY_EDITOR', () => {
  it('returns ATTENTION with PREVIEW_ADD_ACTIVITY on WARN proposal', async () => {
    const contracts = new PageAIContractRegistry();
    const hashService = new PageInsightContextHashService();
    const cache = new PageInsightCacheService();
    const feedbackStore = new PageInsightFeedbackStore();
    const narrative = new PageInsightNarrativeService();

    const activityBuilder = {
      build: jest.fn(async () => ({
        authoritative: {
          tripSnapshot: { tripVersion: 'v1' },
          relevantWorldState: { worldStateVersion: 'none' },
          constraintAssessments: [],
          decisionProblems: [],
          selectedEntities: [],
          availableActions: [],
          pageFocus: {
            pageId: 'ACTIVITY_EDITOR',
            lifecycle: 'PLANNING',
            selectedRefs: [],
          },
        },
        versions: { relevantTripProjectionVersion: 'v1', draftRevision: null },
        gate: { ok: true, missing: [] },
        placeId: 42,
        placeName: '黑沙滩',
        dayIndex: 3,
        dayItems: [{ itemId: 'i1', label: '午餐', type: 'MEAL' }],
        startTime: '14:00',
        endTime: '16:00',
        durationMinutes: 120,
        proposal: {
          proposalId: 'prop_x',
          validation: {
            status: 'WARN',
            warnings: ['加入后当天延长约2小时。'],
            conflicts: [],
          },
          diff: {
            timelineChanges: [
              { operation: 'ADD', label: '黑沙滩', dayIndex: 3, impact: 'medium' },
            ],
            summary: 'add',
          },
          tradeoffs: ['建议预览第3天影响。'],
        },
        allowedFactTokens: ['黑沙滩', '3', '2', '加入后当天延长约2小时。', '建议预览第3天影响。'],
      })),
    };

    const orch = new PageInsightOrchestratorService(
      contracts,
      hashService,
      cache,
      {} as never,
      activityBuilder as never,
      { build: jest.fn() } as never,
      { build: jest.fn() } as never,
      { build: jest.fn() } as never,
      narrative,
      feedbackStore,
    );

    const res = await orch.evaluate('trip_1', {
      pageId: 'ACTIVITY_EDITOR',
      pageMode: 'ACTIVITY_EDITOR',
      insightScope: 'ACTIVITY',
      lifecycle: 'PLANNING',
      selectedRefs: [
        { entityType: 'POI', entityId: '42' },
        { entityType: 'DAY', entityId: '3' },
      ],
      forceRefresh: true,
    });

    expect(res.insight.mode).toBe('ATTENTION');
    expect(res.insight.actions[0]).toMatchObject({
      kind: 'PREVIEW',
      actionType: 'PREVIEW_ADD_ACTIVITY',
      payloadRef: 'plan-proposal:prop_x',
    });
    expect(res.evaluation.activityProposalId).toBe('prop_x');
    expect(res.evaluation.activityProposalStatus).toBe('WARN');
  });
});
