import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { TripConstraintsController } from './controllers/trip-constraints.controller';
import { PlanningCommandsController } from './controllers/planning-commands.controller';
import { ConstraintSolverAccessService } from './services/constraint-solver-access.service';
import { TripConstraintRegistryService } from './services/trip-constraint-registry.service';
import { TripConstraintCommandsService } from './services/trip-constraint-commands.service';
import { TRIP_CONSTRAINT_LEGACY_IDS } from './types/trip-constraint.types';

describe('TripConstraints API (integration)', () => {
  let app: INestApplication;
  const tripId = 'trip-test-1';
  const userId = 'user-1';

  const registryMock = {
    list: jest.fn(),
    getTemplateCatalog: jest.fn(),
    create: jest.fn(),
    patch: jest.fn(),
    patchContract: jest.fn(),
    previewImpact: jest.fn(),
    check: jest.fn(),
    repair: jest.fn(),
  };

  const commandsMock = {
    execute: jest.fn(),
  };

  const accessMock = {
    resolveUserId: jest.fn(() => userId),
    assertTripMember: jest.fn(async () => undefined),
  };

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [TripConstraintsController, PlanningCommandsController],
      providers: [
        { provide: TripConstraintRegistryService, useValue: registryMock },
        { provide: TripConstraintCommandsService, useValue: commandsMock },
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

  it('GET /trips/:tripId/constraints returns list with contract', async () => {
    registryMock.list.mockResolvedValue({
      meta: { tripId, constraintsVersion: 1, total: 1, sections: [] },
      items: [{ id: TRIP_CONSTRAINT_LEGACY_IDS.BUDGET_TOTAL, name: '预算' }],
      contract: {
        schemaId: 'tripnara.travel_decision_contract@v1',
        tripId,
        constraintsVersion: 1,
        objectives: { rankedPrinciples: ['SAFETY', 'PACE'], version: 1 },
        displayPrinciples: [
          { key: 'SAFETY', label: '安全第一', rank: 1 },
          { key: 'PACE', label: '行程轻松', rank: 2 },
        ],
        compiledWeights: { legacy: {}, canonical: {} },
        changeStrategy: { archetype: 'BALANCED', tolerances: {} },
        automation: { defaultLevel: 'SUGGEST', autoAllowed: [], confirmationRequired: [] },
        teamGovernance: { rules: [] },
        conflicts: {
          hasConflicts: false,
          mustHandle: 0,
          suggestAdjust: 0,
          pendingConfirm: 0,
          conflictConstraintIds: [],
        },
      },
    });

    const res = await request(app.getHttpServer())
      .get(`/trips/${tripId}/constraints`)
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data.meta.total).toBe(1);
    expect(res.body.data.contract.schemaId).toBe('tripnara.travel_decision_contract@v1');
    expect(registryMock.list).toHaveBeenCalledWith(tripId, userId, expect.any(Object));
  });

  it('PATCH /trips/:tripId/constraints/contract updates travel decision contract', async () => {
    registryMock.patchContract.mockResolvedValue({
      contract: {
        schemaId: 'tripnara.travel_decision_contract@v1',
        tripId,
        constraintsVersion: 2,
        objectives: {
          rankedPrinciples: ['SAFETY', 'BUDGET', 'PACE'],
          version: 2,
        },
      },
      constraints: { constraintsVersion: 2, constraintsConfirmedAt: null, constraintsConfirmedBy: null },
    });

    const res = await request(app.getHttpServer())
      .patch(`/trips/${tripId}/constraints/contract`)
      .send({
        objectives: { rankedPrinciples: ['SAFETY', 'BUDGET', 'PACE'] },
        constraintsVersion: 1,
      })
      .expect(200);

    expect(res.body.data.contract.objectives.rankedPrinciples[0]).toBe('SAFETY');
    expect(registryMock.patchContract).toHaveBeenCalled();
  });

  it('GET /trips/:tripId/constraints/catalog returns template registry', async () => {
    registryMock.getTemplateCatalog.mockReturnValue({
      schemaId: 'tripnara.constraint_template_catalog@v1',
      version: 1,
      generatedFrom: 'utils/constraint-template-registry.util.ts',
      templates: [
        {
          templateId: 'minimize_hotel_changes',
          constraintId: 'c_tpl_minimize_hotel_changes',
          type: 'SOFT',
          sectionKey: 'soft_prefer',
        },
      ],
    });

    const res = await request(app.getHttpServer())
      .get(`/trips/${tripId}/constraints/catalog?type=SOFT`)
      .expect(200);

    expect(res.body.data.templates[0].templateId).toBe('minimize_hotel_changes');
    expect(registryMock.getTemplateCatalog).toHaveBeenCalledWith({ type: 'SOFT' });
  });

  it('POST /trips/:tripId/constraints/check returns conflicts', async () => {
    registryMock.check.mockResolvedValue({
      tripId,
      hasConflicts: true,
      summary: { mustHandle: 1, suggestAdjust: 0, pendingConfirm: 0, total: 1 },
      conflicts: [],
    });

    const res = await request(app.getHttpServer())
      .post(`/trips/${tripId}/constraints/check`)
      .expect(200);

    expect(res.body.data.hasConflicts).toBe(true);
  });

  it('POST /trips/:tripId/constraints/preview-impact returns assess snapshot', async () => {
    registryMock.previewImpact.mockResolvedValue({
      tripId,
      constraintsVersion: 2,
      refreshType: 'quick',
      assessBefore: { overallAverageScore: 80, overallGrade: 'GOOD', reasonableDays: 3, hasIssuesDays: 0, plannedDays: 3 },
      conflictsBefore: { mustHandle: 0, suggestAdjust: 1, pendingConfirm: 0 },
      recommendations: [],
    });

    const res = await request(app.getHttpServer())
      .post(`/trips/${tripId}/constraints/preview-impact`)
      .send({
        changes: [{ constraintId: TRIP_CONSTRAINT_LEGACY_IDS.PACING_LEVEL, patch: { value: 'relaxed' } }],
      })
      .expect(200);

    expect(res.body.data.assessBefore.overallAverageScore).toBe(80);
    expect(res.body.data.refreshType).toBe('quick');
  });

  it('POST /trips/:tripId/planning/commands runs UPDATE_CONSTRAINTS', async () => {
    commandsMock.execute.mockResolvedValue({
      tripId,
      command: 'UPDATE_CONSTRAINTS',
      applied: [TRIP_CONSTRAINT_LEGACY_IDS.PACING_LEVEL],
      constraintsVersion: 3,
      recalcRecommended: true,
    });

    const res = await request(app.getHttpServer())
      .post(`/trips/${tripId}/planning/commands`)
      .send({
        command: 'UPDATE_CONSTRAINTS',
        changes: [
          { constraintId: TRIP_CONSTRAINT_LEGACY_IDS.PACING_LEVEL, patch: { value: 'relaxed' } },
        ],
      })
      .expect(200);

    expect(res.body.data.command).toBe('UPDATE_CONSTRAINTS');
    expect(res.body.data.applied).toHaveLength(1);
  });
});
