import { selectPlanningOverviewInsight } from './planning-overview-insight.selector';
import type { PlanningOverviewBuiltContext } from './planning-overview-page-context.builder';
import type { UnifiedDecisionProblemListItem } from '../../../decision-runtime/gateway/contracts/unified-decision-ui.types';

function problem(partial: Partial<UnifiedDecisionProblemListItem>): UnifiedDecisionProblemListItem {
  return {
    problemId: 'dp_vehicle',
    semanticKey: 'VEHICLE_ROAD_FIT',
    instanceKey: 'dp_vehicle',
    type: 'CONSTRAINT',
    dimension: 'ROUTE',
    enforcement: 'REQUIRE_CONFIRMATION',
    phase: 'PLANNING',
    affectsPlan: true,
    workflowStatus: 'WAITING_DECISION',
    executionStatus: 'NOT_REQUIRED',
    title: '确认车型',
    summary: '需确认车型以完成道路验证',
    scope: { tripId: 't1' },
    evidenceSummary: { count: 1, freshness: 'FRESH', confidence: 0.9 },
    actionability: {
      requiresAction: true,
      recommendedAction: 'CONFIRM',
      allowedActions: ['CONFIRM'],
      writeChain: 'CONSTRAINT_WRITEBACK',
    },
    occurrenceCount: 1,
    detectors: [{ detectorId: 'v', sourceRefIds: [] }],
    origin: { authority: 'CANONICAL', primaryDetector: 'v' },
    decisionCase: {
      sourceKind: 'CONSTRAINT',
      requiredness: 'IMPORTANT',
      domain: 'TRANSPORT',
      scope: 'TRIP',
      actionKind: 'SELECT',
      materialityScore: 8,
      materialityBreakdown: {
        budget: 1,
        time: 2,
        fitness: 0,
        bookingUrgency: 2,
        safety: 2,
        team: 1,
        irreversibility: 0,
      },
      enrichmentStage: 'ENRICHED',
      writebackTargets: ['ITINERARY'],
      uiGroup: 'IMPORTANT_CHOICE',
      uiGroupLabelZh: '重要选择',
    },
    ...partial,
  };
}

function baseBuilt(
  overrides: Partial<PlanningOverviewBuiltContext> = {},
): PlanningOverviewBuiltContext {
  return {
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
    severity: 'CLEAR',
    openProblemCount: 0,
    mustConfirmCount: 0,
    importantChoiceCount: 0,
    feasibilityMustHandle: 0,
    feasibilitySuggestAdjust: 0,
    gateExecuteBlocked: false,
    vehicleRelatedOpen: false,
    routeRelatedOpen: false,
    lodgingRelatedOpen: false,
    allowedFactTokens: ['0', '车型', '道路验证'],
    ...overrides,
  };
}

describe('selectPlanningOverviewInsight', () => {
  it('CLEAR → SILENT', () => {
    const sel = selectPlanningOverviewInsight({ built: baseBuilt() });
    expect(sel.mode).toBe('SILENT');
    expect(sel.modeReason).toBe('TRIP_CLEAR');
  });

  it('vehicle important → ATTENTION with navigation only', () => {
    const top = problem({});
    const sel = selectPlanningOverviewInsight({
      built: baseBuilt({
        severity: 'ATTENTION',
        openProblemCount: 1,
        importantChoiceCount: 1,
        topProblem: top,
        topBlockerTitle: '确认车型',
        vehicleRelatedOpen: true,
        unlockHint: '先确认车型，系统才能完成道路验证。',
        allowedFactTokens: ['1', '确认车型', '车型', '道路验证', '先确认车型，系统才能完成道路验证。'],
      }),
    });
    expect(sel.mode).toBe('ATTENTION');
    expect(sel.ruleSuggestion).toContain('车型');
    expect(sel.actions.every((a) => a.kind === 'NAVIGATION' || a.kind === 'PREVIEW')).toBe(
      true,
    );
    expect(
      sel.actions.some(
        (a) => a.kind === 'PREVIEW' && (a as { actionType: string }).actionType === 'SELECT_OPTION',
      ),
    ).toBe(false);
  });

  it('MUST_CONFIRM → INTERVENTION', () => {
    const top = problem({
      decisionCase: {
        ...problem({}).decisionCase!,
        uiGroup: 'MUST_CONFIRM',
        requiredness: 'BLOCKING',
        uiGroupLabelZh: '必须确认',
      },
      enforcement: 'BLOCK',
      title: '确认第6晚住宿',
    });
    const sel = selectPlanningOverviewInsight({
      built: baseBuilt({
        severity: 'BLOCKING',
        mustConfirmCount: 1,
        openProblemCount: 1,
        topProblem: top,
        topBlockerTitle: '确认第6晚住宿',
        lodgingRelatedOpen: true,
        allowedFactTokens: ['1', '确认第6晚住宿', '6', '住宿'],
      }),
    });
    expect(sel.mode).toBe('INTERVENTION');
    expect(sel.modeReason).toBe('BLOCKING_READINESS');
  });
});
