import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { PlanningConflictsController } from './controllers/planning-conflicts.controller';
import { ConstraintSolverAccessService } from './services/constraint-solver-access.service';
import { PlanningConflictsService } from './services/planning-conflicts.service';
import { DecisionCheckerService } from './services/decision-checker.service';
import { DECISION_CHECKER_SCHEMA } from './types/decision-checker.types';

describe('PlanningConflicts deferred decisionChecker (integration)', () => {
  let app: INestApplication;
  const tripId = 'trip-test-1';
  const userId = 'user-1';

  const planningMock = {
    loadArtifacts: jest.fn(),
    loadArtifactsFast: jest.fn(),
    resolveRevisionKey: jest.fn(),
    getCachedArtifacts: jest.fn(),
    getStaleCachedArtifacts: jest.fn(),
    getPlanningConflicts: jest.fn(),
  };

  const decisionCheckerMock = {
    startPlanningDeferred: jest.fn(),
    startPlanningDeferredWithFullRefresh: jest.fn(),
    getPlanningDeferred: jest.fn(),
    findActivePendingPlanningDeferred: jest.fn(),
    buildDeferredPollMeta: jest.fn((tripId: string, taskId: string, status: string, error?: string) => ({
      status,
      taskId,
      pollUrl: `/trips/${tripId}/planning-conflicts?decisionCheckerTaskId=${taskId}`,
      ...(error ? { error } : {}),
      ...(status === 'pending' ? { pollIntervalMs: 5000 } : {}),
    })),
  };

  const accessMock = {
    resolveUserId: jest.fn(() => userId),
    assertTripMember: jest.fn(async () => undefined),
  };

  const baseResponse = {
    tripId,
    summary: { total: 1, mustHandle: 1, suggestAdjust: 0, pendingConfirm: 0, byCategory: {} },
    conflicts: [{ id: 'cfl_1', source: 'feasibility' as const, priority: 'must_handle' as const, category: 'schedule' as const, title: 't', message: 'm' }],
  };

  const baseReport = {
    issues: [],
    verdict: { status: 'caution' as const },
    isStale: false,
    overallScore: 80,
  };

  const baseArtifacts = { response: { ...baseResponse }, report: baseReport };

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [PlanningConflictsController],
      providers: [
        { provide: PlanningConflictsService, useValue: planningMock },
        { provide: DecisionCheckerService, useValue: decisionCheckerMock },
        { provide: ConstraintSolverAccessService, useValue: accessMock },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    planningMock.resolveRevisionKey.mockResolvedValue('V1');
    planningMock.getCachedArtifacts.mockReturnValue(undefined);
    planningMock.getStaleCachedArtifacts.mockReturnValue(undefined);
    planningMock.loadArtifactsFast.mockResolvedValue(baseArtifacts);
    planningMock.loadArtifacts.mockResolvedValue(baseArtifacts);
    decisionCheckerMock.findActivePendingPlanningDeferred.mockReturnValue(undefined);
  });

  it('includeDecisionChecker=1 returns fast conflicts first with deferred meta', async () => {
    decisionCheckerMock.startPlanningDeferredWithFullRefresh.mockReturnValue({
      taskId: 'dc_embed_test',
      pollUrl: `/trips/${tripId}/planning-conflicts?decisionCheckerTaskId=dc_embed_test`,
    });

    const res = await request(app.getHttpServer())
      .get(`/trips/${tripId}/planning-conflicts`)
      .query({ includeDecisionChecker: '1', focusConflictId: 'cfl_1' })
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data.conflicts).toHaveLength(1);
    expect(res.body.data.isStale).toBe(true);
    expect(res.body.data.decisionChecker).toBeUndefined();
    expect(res.body.data.decisionCheckerDeferred).toEqual({
      status: 'pending',
      taskId: 'dc_embed_test',
      pollUrl: `/trips/${tripId}/planning-conflicts?decisionCheckerTaskId=dc_embed_test`,
      pollIntervalMs: 5000,
    });
    expect(planningMock.loadArtifactsFast).toHaveBeenCalledWith(tripId);
    expect(planningMock.loadArtifacts).not.toHaveBeenCalled();
    expect(decisionCheckerMock.startPlanningDeferredWithFullRefresh).toHaveBeenCalledWith(
      tripId,
      baseArtifacts,
      expect.objectContaining({ skipConstraintsSummary: true }),
      expect.objectContaining({ focusConflictId: 'cfl_1' }),
    );
  });

  it('uses cache hit for deferred path without loadArtifactsFast', async () => {
    planningMock.getCachedArtifacts.mockReturnValue(baseArtifacts);
    decisionCheckerMock.startPlanningDeferred.mockReturnValue({
      taskId: 'dc_embed_cached',
      pollUrl: `/trips/${tripId}/planning-conflicts?decisionCheckerTaskId=dc_embed_cached`,
    });

    const res = await request(app.getHttpServer())
      .get(`/trips/${tripId}/planning-conflicts`)
      .query({ includeDecisionChecker: '1' })
      .expect(200);

    expect(planningMock.loadArtifactsFast).not.toHaveBeenCalled();
    expect(decisionCheckerMock.startPlanningDeferred).toHaveBeenCalled();
    expect(res.body.data.decisionCheckerDeferred.taskId).toBe('dc_embed_cached');
  });

  it('decisionCheckerTaskId poll returns ready decisionChecker', async () => {
    decisionCheckerMock.getPlanningDeferred.mockReturnValue({
      tripId,
      status: 'ready',
      planningResponse: { ...baseResponse },
      decisionChecker: {
        schema: DECISION_CHECKER_SCHEMA,
        tripId,
        generatedAt: '2026-06-28T10:12:00Z',
        overview: {},
        evidence: { items: [], summary: { high: 0, medium: 0, low: 0 } },
        impact: { summary: {}, constraints: [], cascade: [] },
        counterfactual: { scenarios: [] },
        snapshotVersion: 'v1',
      },
      promise: Promise.resolve({}),
    });

    const res = await request(app.getHttpServer())
      .get(`/trips/${tripId}/planning-conflicts`)
      .query({ decisionCheckerTaskId: 'dc_embed_test' })
      .expect(200);

    expect(res.body.data.decisionChecker.schema).toBe(DECISION_CHECKER_SCHEMA);
    expect(res.body.data.decisionCheckerDeferred.status).toBe('ready');
  });
});
