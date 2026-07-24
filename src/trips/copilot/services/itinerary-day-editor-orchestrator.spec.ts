import { PageAIContractRegistry, PageContractNotFoundError } from './page-ai-contract.registry';
import { PageInsightOrchestratorService } from './page-insight-orchestrator.service';
import { PageInsightContextHashService } from './page-insight-context-hash.service';
import { PageInsightCacheService } from './page-insight-cache.service';
import { PageInsightFeedbackStore } from './page-insight-feedback.store';
import { PageInsightNarrativeService } from './page-insight-narrative.service';

describe('ITINERARY_DAY_EDITOR registry + orchestrator', () => {
  it('is live in registry', () => {
    const registry = new PageAIContractRegistry();
    expect(registry.get('ITINERARY_DAY_EDITOR').pageContractVersion).toBe(
      'itinerary_day_editor@1.1',
    );
    expect(registry.get('PLANNING_OVERVIEW').pageContractVersion).toBe(
      'planning_overview@1.0',
    );
    expect(() => registry.get('ITINERARY_EDITOR')).toThrow(PageContractNotFoundError);
  });

  it('evaluate returns INCOMPLETE with generate-draft action', async () => {
    const dayBuilder = {
      build: jest.fn(async () => ({
        authoritative: {
          tripSnapshot: { tripVersion: 'v1' },
          relevantWorldState: { worldStateVersion: 'none' },
          constraintAssessments: [],
          decisionProblems: [],
          selectedEntities: [],
          availableActions: [],
          pageFocus: {
            pageId: 'ITINERARY_DAY_EDITOR',
            lifecycle: 'PLANNING',
            selectedRefs: [],
          },
        },
        versions: { relevantTripProjectionVersion: 'v1', draftRevision: null },
        gate: { ok: true, missing: [] },
        dayIndex: 4,
        dayItems: [
          {
            itemId: 'h1',
            label: '维克旅馆',
            type: 'ACCOMMODATION',
            needsBooking: true,
          },
        ],
        dayPlanStatus: 'INCOMPLETE',
        daySeverity: 'SOFT',
        incompleteReason: '只有住宿，关键活动与路线尚未安排',
        activityCount: 0,
        lodgingCount: 1,
        pendingBookingLabels: ['维克旅馆'],
        confirmedActivityLabels: [],
        gaps: [],
        mustHandleCount: 0,
        suggestAdjustCount: 0,
        allowedFactTokens: ['4', 'Day 4', '维克旅馆', '只有住宿，关键活动与路线尚未安排'],
      })),
    };

    const orch = new PageInsightOrchestratorService(
      new PageAIContractRegistry(),
      new PageInsightContextHashService(),
      new PageInsightCacheService(),
      {} as never,
      { build: jest.fn() } as never,
      dayBuilder as never,
      { build: jest.fn() } as never,
      { build: jest.fn() } as never,
      new PageInsightNarrativeService(),
      new PageInsightFeedbackStore(),
    );

    const res = await orch.evaluate('trip_1', {
      pageId: 'ITINERARY_DAY_EDITOR',
      pageMode: 'ITINERARY_DAY_EDITOR',
      insightScope: 'ITINERARY_DAY',
      lifecycle: 'PLANNING',
      viewport: { selectedDayIndex: 4 },
      forceRefresh: true,
    });

    expect(res.insight.mode).toBe('ATTENTION');
    expect(res.evaluation.dayPlanStatus).toBe('INCOMPLETE');
    expect(res.insight.title).toMatch(/不完整/);
    expect(res.insight.actions.some((a) => a.kind === 'PREVIEW' && a.actionType === 'GENERATE_DAY_DRAFT')).toBe(
      true,
    );
    expect(res.insight.advisorCopy?.body).not.toMatch(/当日可行/);
  });

  it('evaluate returns ATTENTION with PREVIEW_REORDER for tight repair', async () => {
    const dayBuilder = {
      build: jest.fn(async () => ({
        authoritative: {
          tripSnapshot: { tripVersion: 'v1' },
          relevantWorldState: { worldStateVersion: 'none' },
          constraintAssessments: [],
          decisionProblems: [],
          selectedEntities: [],
          availableActions: [],
          pageFocus: {
            pageId: 'ITINERARY_DAY_EDITOR',
            lifecycle: 'PLANNING',
            selectedRefs: [],
          },
        },
        versions: { relevantTripProjectionVersion: 'v1', draftRevision: null },
        gate: { ok: true, missing: [] },
        dayIndex: 3,
        dayItems: [
          {
            itemId: 'i1',
            label: '午餐',
            type: 'MEAL',
            startTime: '12:00',
            endTime: '13:00',
            needsBooking: false,
          },
        ],
        dayPlanStatus: 'TIGHT',
        daySeverity: 'SOFT',
        topIssue: {
          issueId: 'iss1',
          priority: 'suggest_adjust',
          message: '上一活动延迟至12:30，将占用原午餐时间。',
          affectedLabels: ['午餐'],
        },
        activityCount: 1,
        lodgingCount: 0,
        pendingBookingLabels: [],
        confirmedActivityLabels: [],
        gaps: [],
        mustHandleCount: 0,
        suggestAdjustCount: 1,
        proposal: {
          proposalId: 'prop_day_x',
          validation: {
            status: 'WARN',
            warnings: ['上一活动延迟至12:30，将占用原午餐时间。'],
            conflicts: [],
          },
          diff: {
            timelineChanges: [
              { operation: 'MOVE', label: '午餐', dayIndex: 3, impact: 'medium' },
            ],
            summary: 'reorder',
          },
          tradeoffs: ['午餐后移30分钟影响最小。'],
        },
        proposalActionType: 'PREVIEW_REORDER',
        allowedFactTokens: [
          '3',
          '午餐',
          '12:30',
          '30',
          '上一活动延迟至12:30，将占用原午餐时间。',
          '午餐后移30分钟影响最小。',
        ],
      })),
    };

    const orch = new PageInsightOrchestratorService(
      new PageAIContractRegistry(),
      new PageInsightContextHashService(),
      new PageInsightCacheService(),
      {} as never,
      { build: jest.fn() } as never,
      dayBuilder as never,
      { build: jest.fn() } as never,
      { build: jest.fn() } as never,
      new PageInsightNarrativeService(),
      new PageInsightFeedbackStore(),
    );

    const res = await orch.evaluate('trip_1', {
      pageId: 'ITINERARY_DAY_EDITOR',
      pageMode: 'ITINERARY_DAY_EDITOR',
      insightScope: 'ITINERARY_DAY',
      lifecycle: 'PLANNING',
      viewport: { selectedDayIndex: 3 },
      forceRefresh: true,
    });

    expect(res.insight.mode).toBe('ATTENTION');
    expect(res.evaluation.dayPlanStatus).toBe('TIGHT');
    expect(res.insight.actions[0]).toMatchObject({
      kind: 'PREVIEW',
      actionType: 'PREVIEW_REORDER',
      payloadRef: 'plan-proposal:prop_day_x',
    });
  });
});
