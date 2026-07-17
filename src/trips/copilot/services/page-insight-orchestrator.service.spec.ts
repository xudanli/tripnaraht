import { PageInsightOrchestratorService } from './page-insight-orchestrator.service';
import { PageAIContractRegistry } from './page-ai-contract.registry';
import { PageInsightContextHashService } from './page-insight-context-hash.service';
import { PageInsightCacheService } from './page-insight-cache.service';
import { PageInsightFeedbackStore } from './page-insight-feedback.store';
import { PageInsightNarrativeService } from './page-insight-narrative.service';
import type {
  DecisionSpacePageContextBuilder,
  FocusResolveDiag,
} from './decision-space-page-context.builder';
import type { UnifiedDecisionProblemListItem } from '../../../decision-runtime/gateway/contracts/unified-decision-ui.types';
import type { ClientPageState } from '../contracts/page-insight.types';

function matchedFocusDiag(p: UnifiedDecisionProblemListItem): FocusResolveDiag {
  return {
    clientSelectedRef: p.problemId,
    resolveStatus: 'MATCHED_PROBLEM_ID',
    resolvedProblemId: p.problemId,
    matchedVia: 'problemId',
    openProblemIds: [p.problemId],
    openInstanceKeys: [p.instanceKey],
    workspacePresentForFocused: false,
  };
}
describe('PageInsightOrchestratorService (Decision Space slice)', () => {
  const stubActivityBuilder = { build: jest.fn() } as never;
  const stubDayBuilder = { build: jest.fn() } as never;
  const stubOverviewBuilder = { build: jest.fn() } as never;
  const stubExecBuilder = { build: jest.fn() } as never;

  const focused: UnifiedDecisionProblemListItem = {
    problemId: 'dc_glacier_t',
    semanticKey: 'OPPORTUNITY.GLACIER_EXPERIENCE',
    instanceKey: 'dc_glacier_t',
    type: 'PREFERENCE_CONFLICT',
    dimension: 'EXPERIENCE',
    enforcement: 'REQUIRE_ADJUSTMENT',
    phase: 'PLANNING',
    affectsPlan: true,
    workflowStatus: 'WAITING_DECISION',
    executionStatus: 'NOT_REQUIRED',
    title: '选择哪种冰川体验？',
    summary: '加入冰川徒步会影响时间与体力。',
    scope: { tripId: 'trip_t' },
    evidenceSummary: { count: 2, freshness: 'FRESH', confidence: 0.88 },
    actionability: {
      requiresAction: true,
      recommendedAction: 'ALTERNATIVE',
      allowedActions: ['ALTERNATIVE'],
      writeChain: 'CONSTRAINT_WRITEBACK',
    },
    occurrenceCount: 1,
    detectors: [{ detectorId: 'g', sourceRefIds: ['pref:adventure'] }],
    origin: { authority: 'CANONICAL', primaryDetector: 'g' },
    decisionCase: {
      sourceKind: 'OPPORTUNITY',
      requiredness: 'IMPORTANT',
      domain: 'EXPERIENCE',
      scope: 'ACTIVITY',
      actionKind: 'SELECT',
      materialityScore: 7,
      materialityBreakdown: {
        budget: 2,
        time: 3,
        fitness: 1,
        bookingUrgency: 1,
        safety: 0,
        team: 0,
        irreversibility: 0,
      },
      enrichmentStage: 'ENRICHED',
      writebackTargets: ['ITINERARY'],
      uiGroup: 'IMPORTANT_CHOICE',
      uiGroupLabelZh: '关键选择',
    },
  };

  const client: ClientPageState = {
    pageId: 'DECISION_SPACE',
    lifecycle: 'PLANNING',
    selectedRefs: [{ entityType: 'DECISION_PROBLEM', entityId: 'dc_glacier_t' }],
  };

  function createOrchestrator(workspaceVersion = 'dw_v1') {
    const builder: Pick<DecisionSpacePageContextBuilder, 'build'> = {
      async build() {
        return {
          authoritative: {
            tripSnapshot: { tripVersion: 'tv1' },
            relevantWorldState: { worldStateVersion: 'ws1' },
            constraintAssessments: [],
            decisionProblems: [{ problemId: focused.problemId, payload: focused }],
            selectedEntities: [],
            availableActions: [],
            pageFocus: {
              pageId: 'DECISION_SPACE',
              lifecycle: 'PLANNING',
              selectedRefs: client.selectedRefs ?? [],
            },
          },
          versions: {
            relevantTripProjectionVersion: 'tv1',
            relevantConstraintVersion: 'c1',
            relevantDecisionWorkspaceVersion: workspaceVersion,
            relevantWorldStateVersion: 'ws1',
          },
          focusedProblem: focused,
          optionsView: {
            schemaId: 'tripnara.unified_decision_options@v2',
            tripId: 'trip_t',
            problemId: focused.problemId,
            generatedAt: new Date().toISOString(),
            actions: [
              {
                actionId: 'glacier_hike',
                type: 'ALTERNATIVE',
                source: 'RULE_ENGINE',
                title: '冰川徒步',
                summary: '3–5 小时',
                requiresConfirmation: true,
                allowed: true,
                expectedImpact: { durationDelta: 210, budgetDelta: 12000 },
              },
              {
                actionId: 'glacier_short',
                type: 'ALTERNATIVE',
                source: 'RULE_ENGINE',
                title: '短线',
                summary: '2–3 小时',
                requiresConfirmation: true,
                allowed: true,
                expectedImpact: { durationDelta: 120, budgetDelta: 8000 },
              },
            ],
            actionability: {
              requiresAction: true,
              allowedActions: ['ALTERNATIVE'],
              writeChain: 'CONSTRAINT_WRITEBACK',
            },
          },
          openProblems: [focused],
          focusDiag: {
            clientSelectedRef: client.selectedRefs?.[0]?.entityId ?? null,
            resolveStatus: 'MATCHED_PROBLEM_ID',
            resolvedProblemId: focused.problemId,
            matchedVia: 'problemId',
            openProblemIds: [focused.problemId],
            openInstanceKeys: [focused.instanceKey],
            workspacePresentForFocused: false,
          } satisfies FocusResolveDiag,
        };
      },
    };

    return new PageInsightOrchestratorService(
      new PageAIContractRegistry(),
      new PageInsightContextHashService(),
      new PageInsightCacheService(),
      builder as DecisionSpacePageContextBuilder,
      stubActivityBuilder,
      stubDayBuilder,
      stubOverviewBuilder,
      stubExecBuilder,
      new PageInsightNarrativeService(),
      new PageInsightFeedbackStore(),
    );
  }

  it('DETAIL match → SILENT (no stacked yellow card); LIST fallback → ATTENTION', async () => {
    const orchDetail = createOrchestrator();
    const detail = await orchDetail.evaluate('trip_t', client);
    expect(detail.insight.mode).toBe('SILENT');
    expect(detail.evaluation.modeReason).toBe('DETAIL_SURFACE_SUPPRESSES');

    const listClient: ClientPageState = {
      pageId: 'DECISION_SPACE',
      lifecycle: 'PLANNING',
    };
    const builder: Pick<DecisionSpacePageContextBuilder, 'build'> = {
      async build() {
        return {
          authoritative: {
            tripSnapshot: { tripVersion: 'tv1' },
            relevantWorldState: { worldStateVersion: 'ws1' },
            constraintAssessments: [],
            decisionProblems: [{ problemId: focused.problemId, payload: focused }],
            selectedEntities: [],
            availableActions: [],
            pageFocus: {
              pageId: 'DECISION_SPACE',
              lifecycle: 'PLANNING',
              selectedRefs: [],
            },
          },
          versions: {
            relevantTripProjectionVersion: 'tv1',
            relevantConstraintVersion: 'c1',
            relevantDecisionWorkspaceVersion: 'dw_list',
            relevantWorldStateVersion: 'ws1',
          },
          focusedProblem: focused,
          optionsView: {
            schemaId: 'tripnara.unified_decision_options@v2',
            tripId: 'trip_t',
            problemId: focused.problemId,
            generatedAt: new Date().toISOString(),
            actions: [
              {
                actionId: 'glacier_hike',
                type: 'ALTERNATIVE',
                source: 'RULE_ENGINE',
                title: '冰川徒步',
                summary: '3–5 小时',
                requiresConfirmation: true,
                allowed: true,
                expectedImpact: { durationDelta: 210, budgetDelta: 12000 },
              },
              {
                actionId: 'glacier_short',
                type: 'ALTERNATIVE',
                source: 'RULE_ENGINE',
                title: '短线',
                summary: '2–3 小时',
                requiresConfirmation: true,
                allowed: true,
                expectedImpact: { durationDelta: 120, budgetDelta: 8000 },
              },
            ],
            actionability: {
              requiresAction: true,
              allowedActions: ['ALTERNATIVE'],
              writeChain: 'CONSTRAINT_WRITEBACK',
            },
          },
          openProblems: [focused],
          focusDiag: {
            clientSelectedRef: null,
            resolveStatus: 'FALLBACK_MOST_IMPORTANT',
            resolvedProblemId: focused.problemId,
            matchedVia: 'fallback',
            openProblemIds: [focused.problemId],
            openInstanceKeys: [focused.instanceKey],
            workspacePresentForFocused: false,
          },
        };
      },
    };
    const orchList = new PageInsightOrchestratorService(
      new PageAIContractRegistry(),
      new PageInsightContextHashService(),
      new PageInsightCacheService(),
      builder as DecisionSpacePageContextBuilder,
      stubActivityBuilder,
      stubDayBuilder,
      stubOverviewBuilder,
      stubExecBuilder,
      new PageInsightNarrativeService(),
      new PageInsightFeedbackStore(),
    );
    const list = await orchList.evaluate('trip_t', listClient);
    expect(list.insight.mode).toBe('ATTENTION');
    expect(list.evaluation.modeReason).toBe('MATERIAL_OPTION_DIVERGENCE');
    expect(list.insight.actions.some((a) => a.label === '打开决策空间')).toBe(false);
  });

  it('forceRefresh does not overwrite proactive SILENT cache', async () => {
    const focusedSingle = { ...focused };
    const cache = new PageInsightCacheService();
    const feedback = new PageInsightFeedbackStore();
    const makeBuilder = (): DecisionSpacePageContextBuilder =>
      ({
        async build() {
          return {
            authoritative: {
              tripSnapshot: { tripVersion: 'tv1' },
              relevantWorldState: { worldStateVersion: 'ws1' },
              constraintAssessments: [],
              decisionProblems: [],
              selectedEntities: [],
              availableActions: [],
              pageFocus: {
                pageId: 'DECISION_SPACE',
                lifecycle: 'PLANNING',
                selectedRefs: [],
              },
            },
            versions: {
              relevantTripProjectionVersion: 'tv1',
              relevantConstraintVersion: 'c1',
              relevantDecisionWorkspaceVersion: 'dw_silent',
              relevantWorldStateVersion: 'ws1',
            },
            focusedProblem: focusedSingle,
            optionsView: {
              schemaId: 'tripnara.unified_decision_options@v2',
              tripId: 'trip_t',
              problemId: focused.problemId,
              generatedAt: new Date().toISOString(),
              actions: [
                {
                  actionId: 'only',
                  type: 'ALTERNATIVE',
                  source: 'RULE_ENGINE',
                  title: '唯一',
                  summary: 'x',
                  requiresConfirmation: true,
                  allowed: true,
                },
              ],
              actionability: {
                requiresAction: true,
                allowedActions: ['ALTERNATIVE'],
                writeChain: 'CONSTRAINT_WRITEBACK',
              },
            },
            openProblems: [focusedSingle],
            focusDiag: matchedFocusDiag(focusedSingle),
          };
        },
      }) as DecisionSpacePageContextBuilder;

    const orch = new PageInsightOrchestratorService(
      new PageAIContractRegistry(),
      new PageInsightContextHashService(),
      cache,
      makeBuilder(),
      stubActivityBuilder,
      stubDayBuilder,
      stubOverviewBuilder,
      stubExecBuilder,
      new PageInsightNarrativeService(),
      feedback,
    );

    const silent = await orch.evaluate('trip_t', client);
    expect(silent.insight.mode).toBe('SILENT');
    expect(silent.evaluation.modeReason).toBe('DETAIL_SURFACE_SUPPRESSES');
    expect(silent.evaluation.focusedRequiresAction).toBe(true);

    const asked = await orch.evaluate('trip_t', { ...client, forceRefresh: true });
    expect(asked.insight.mode).toBe('ATTENTION');
    expect(asked.evaluation.modeReason).toBe('EXPLICIT_ASK');
    expect(asked.evaluation.explicitAsk).toBe(true);
    expect(asked.insight.advisorCopy).toBeDefined();
    expect(asked.insight.advisorCopy!.body).not.toBe(focusedSingle.summary);
    expect(asked.insight.impacts).toEqual([]);
    expect(asked.insight.causalDecisionCard).toBeUndefined();
    expect(asked.insight.recommendation?.summary).toBe(asked.insight.advisorCopy!.advice);

    const again = await orch.evaluate('trip_t', client);
    expect(again.evaluation.cacheHit).toBe(true);
    expect(again.insight.mode).toBe('SILENT');
  });

  it('invalidates when workspace version changes', async () => {
    const cache = new PageInsightCacheService();
    const feedback = new PageInsightFeedbackStore();
    const hash = new PageInsightContextHashService();
    const registry = new PageAIContractRegistry();
    const narrative = new PageInsightNarrativeService();

    const makeBuilder = (dw: string): DecisionSpacePageContextBuilder =>
      ({
        async build() {
          return {
            authoritative: {
              tripSnapshot: { tripVersion: 'tv1' },
              relevantWorldState: { worldStateVersion: 'ws1' },
              constraintAssessments: [],
              decisionProblems: [],
              selectedEntities: [],
              availableActions: [],
              pageFocus: {
                pageId: 'DECISION_SPACE',
                lifecycle: 'PLANNING',
                selectedRefs: [],
              },
            },
            versions: {
              relevantTripProjectionVersion: 'tv1',
              relevantConstraintVersion: 'c1',
              relevantDecisionWorkspaceVersion: dw,
              relevantWorldStateVersion: 'ws1',
            },
            focusedProblem: focused,
            openProblems: [focused],
            focusDiag: matchedFocusDiag(focused),
          };
        },
      }) as DecisionSpacePageContextBuilder;

    const orch1 = new PageInsightOrchestratorService(
      registry,
      hash,
      cache,
      makeBuilder('dw_1'),
      stubActivityBuilder,
      stubDayBuilder,
      stubOverviewBuilder,
      stubExecBuilder,
      narrative,
      feedback,
    );
    const a = await orch1.evaluate('trip_t', client);

    const orch2 = new PageInsightOrchestratorService(
      registry,
      hash,
      cache,
      makeBuilder('dw_2'),
      stubActivityBuilder,
      stubDayBuilder,
      stubOverviewBuilder,
      stubExecBuilder,
      narrative,
      feedback,
    );
    const b = await orch2.evaluate('trip_t', client);
    expect(b.evaluation.cacheHit).toBe(false);
    expect(b.evaluation.contextHash).not.toBe(a.evaluation.contextHash);
  });

  it('records feedback without writing plan', async () => {
    const feedback = new PageInsightFeedbackStore();
    const orch = new PageInsightOrchestratorService(
      new PageAIContractRegistry(),
      new PageInsightContextHashService(),
      new PageInsightCacheService(),
      {
        async build() {
          return {
            authoritative: {
              tripSnapshot: { tripVersion: 'tv1' },
              relevantWorldState: { worldStateVersion: 'ws1' },
              constraintAssessments: [],
              decisionProblems: [],
              selectedEntities: [],
              availableActions: [],
              pageFocus: {
                pageId: 'DECISION_SPACE',
                lifecycle: 'PLANNING',
                selectedRefs: [],
              },
            },
            versions: {
              relevantTripProjectionVersion: 'tv1',
              relevantConstraintVersion: 'c1',
              relevantDecisionWorkspaceVersion: 'dw',
              relevantWorldStateVersion: 'ws1',
            },
            focusedProblem: focused,
            openProblems: [focused],
            focusDiag: matchedFocusDiag(focused),
          };
        },
      } as DecisionSpacePageContextBuilder,
      stubActivityBuilder,
      stubDayBuilder,
      stubOverviewBuilder,
      stubExecBuilder,
      new PageInsightNarrativeService(),
      feedback,
    );
    const evaluated = await orch.evaluate('trip_t', client);
    orch.submitFeedback('trip_t', evaluated.insight.id, {
      type: 'ACTION_PREVIEWED',
      actionRef: 'decision-problem:dc_glacier_t',
    });
    expect(feedback.listFeedback('trip_t')[0]?.type).toBe('ACTION_PREVIEWED');
  });
});
