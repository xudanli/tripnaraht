import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { DecisionCheckerController } from './controllers/decision-checker.controller';
import { ConstraintSolverAccessService } from './services/constraint-solver-access.service';
import { DecisionCheckerService } from './services/decision-checker.service';
import { DECISION_CHECKER_SCHEMA } from './types/decision-checker.types';

describe('DecisionChecker API (integration)', () => {
  let app: INestApplication;
  const tripId = 'trip-test-1';
  const userId = 'user-1';

  const decisionCheckerMock = {
    getDecisionChecker: jest.fn(),
    refreshDecisionChecker: jest.fn(),
  };

  const accessMock = {
    resolveUserId: jest.fn(() => userId),
    assertTripMember: jest.fn(async () => undefined),
  };

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [DecisionCheckerController],
      providers: [
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
  });

  it('GET /trips/:tripId/decision-checker returns projection', async () => {
    decisionCheckerMock.getDecisionChecker.mockResolvedValue({
      schema: DECISION_CHECKER_SCHEMA,
      tripId,
      generatedAt: '2026-06-28T10:12:00Z',
      overview: { conflict: { hardCount: 1 } },
      evidence: { items: [], summary: { high: 0, medium: 0, low: 0 } },
      impact: { summary: {}, constraints: [], cascade: [] },
      counterfactual: { scenarios: [] },
      snapshotVersion: 'constraints_v1:plan_v0:conflicts_test',
    });

    const res = await request(app.getHttpServer())
      .get(`/trips/${tripId}/decision-checker`)
      .query({ focusConflictId: 'cfl_drive_day2', constraintsVersion: 3 })
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data.schema).toBe(DECISION_CHECKER_SCHEMA);
    expect(decisionCheckerMock.getDecisionChecker).toHaveBeenCalledWith(
      tripId,
      expect.objectContaining({ focusConflictId: 'cfl_drive_day2', constraintsVersion: 3 }),
    );
  });

  it('POST /trips/:tripId/decision-checker/refresh returns 202 task', async () => {
    decisionCheckerMock.refreshDecisionChecker.mockResolvedValue({
      taskId: 'dc_refresh_abc',
      pollUrl: `/trips/${tripId}/decision-checker?taskId=dc_refresh_abc`,
    });

    const res = await request(app.getHttpServer())
      .post(`/trips/${tripId}/decision-checker/refresh`)
      .send({ reason: 'constraints_changed', constraintsVersion: 3 })
      .expect(202);

    expect(res.body.success).toBe(true);
    expect(res.body.data.taskId).toMatch(/^dc_refresh_/);
  });
});
