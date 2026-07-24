import { DecisionCheckerService } from './decision-checker.service';
import { DECISION_CHECKER_SCHEMA } from '../types/decision-checker.types';

describe('DecisionCheckerService deferred', () => {
  const tripId = 'trip-deferred-1';
  const fastArtifacts = {
    response: {
      tripId,
      summary: { total: 1, mustHandle: 0, suggestAdjust: 1, pendingConfirm: 0, byCategory: {} },
      conflicts: [{ id: 'c1', source: 'schedule' as const, priority: 'suggest_adjust' as const, category: 'schedule' as const, title: 't', message: 'm' }],
      isStale: true,
    },
    report: {
      tripId,
      issues: [],
      verdict: { status: 'caution' as const },
      isStale: true,
      overallScore: 70,
      teamFitSummary: { score: 80, memberCount: 2, profilingCompletedCount: 1 },
    },
  };

  const dcPayload = {
    schema: DECISION_CHECKER_SCHEMA,
    tripId,
    generatedAt: '2026-06-29T00:00:00.000Z',
    overview: { conflict: { hardCount: 1 } },
    evidence: { items: [], summary: { high: 0, medium: 0, low: 0 } },
    impact: { summary: {}, constraints: [], cascade: [] },
    counterfactual: { scenarios: [] },
    snapshotVersion: 'v1',
  };

  let loadArtifacts: jest.Mock;
  let service: DecisionCheckerService;

  beforeEach(() => {
    loadArtifacts = jest.fn(
      () =>
        new Promise(() => {
          /* never resolves — must not block deferred ready */
        }),
    );

    service = new DecisionCheckerService(
      {
        loadArtifacts,
        resolveRevisionKey: jest.fn(),
        getCachedArtifacts: jest.fn(),
        loadArtifactsFast: jest.fn(),
      } as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );

    jest.spyOn(service as any, 'buildDecisionChecker').mockResolvedValue(dcPayload);
  });

  it('startPlanningDeferredWithFullRefresh becomes ready without waiting for loadArtifacts', async () => {
    const { taskId } = service.startPlanningDeferredWithFullRefresh(
      tripId,
      fastArtifacts as any,
      { skipConstraintsSummary: true },
    );

    expect(loadArtifacts).toHaveBeenCalled();

    await new Promise((r) => setTimeout(r, 20));

    const entry = service.getPlanningDeferred(taskId, tripId);
    expect(entry?.status).toBe('ready');
    expect(entry?.decisionChecker?.schema).toBe(DECISION_CHECKER_SCHEMA);
  });

  it('getPlanningDeferred attaches decisionChecker when status sync lagged', async () => {
    const { taskId } = service.startPlanningDeferredWithFullRefresh(
      tripId,
      fastArtifacts as any,
      undefined,
    );

    await new Promise((r) => setTimeout(r, 20));

    const entry = service.getPlanningDeferred(taskId, tripId);
    expect(entry?.decisionChecker).toBeDefined();
    expect(entry?.status).toBe('ready');
  });
});
