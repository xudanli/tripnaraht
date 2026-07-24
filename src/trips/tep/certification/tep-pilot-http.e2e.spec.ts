/**
 * TEP Pilot HTTP E2E — Nest ExecutabilityController + Mobile tep-repairs/accept
 *
 * Uses a slim TestingModule (no TripConstraintSolverModule) to avoid heavy deps.
 * Skipped unless TEP_PILOT_HTTP_E2E=1 and DATABASE_URL are set.
 *
 * Run (after seed):
 *   TEP_PILOT_HTTP_E2E=1 DATABASE_URL=... npm run test:tep-pilot-http
 */

import { INestApplication, Controller, Post, Param, Body } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { PrismaModule } from '../../../prisma/prisma.module';
import { PrismaService } from '../../../prisma/prisma.service';
import { EffectivePlanWriteGuardService } from '../../../decision-runtime/execution/effective-plan-write-guard.service';
import { Rfc001ItineraryMaterializerService } from '../../guardian-decision-core/execution/rfc001-itinerary-materializer.service';
import { Rfc001PlanVersionStoreService } from '../../guardian-decision-core/plan-version/plan-version.store';
import { WorldStateStoreService } from '../../guardian-decision-core/evidence/world-state-store.service';
import { FeasibilityReportService } from '../../trip-constraint-solver/services/feasibility-report.service';
import { ConstraintSolverAccessService } from '../../trip-constraint-solver/services/constraint-solver-access.service';
import { ExecutabilityController } from '../controllers/executability.controller';
import { ExecutabilityAssessmentService } from '../services/executability-assessment.service';
import { TepOrchestratorService } from '../orchestrators/tep-orchestrator.service';
import { WorldStateTepEvidenceService } from '../services/world-state-tep-evidence.service';
import { TepPlanMetadataService } from '../services/tep-plan-metadata.service';
import { TepLocalRepairApplyService } from '../services/tep-local-repair-apply.service';
import { TepRepairExecutionStore } from '../services/tep-repair-execution.store';
import {
  PILOT_IS_01_ITEM_STOP,
  PILOT_IS_01_PLAN_VERSION_ID,
  PILOT_IS_01_TRIP_ID,
  TEP_PILOT_USER_ID,
} from '../../../../scripts/tep-pilot-is-seed.constants';

function isTepPilotHttpE2eEnabled(): boolean {
  return (
    process.env.TEP_PILOT_HTTP_E2E === '1' &&
    Boolean(process.env.DATABASE_URL?.trim()) &&
    !/tripnara_prod|production/i.test(process.env.DATABASE_URL ?? '')
  );
}

function buildPilotFeasibilityStub(planVersionId: string) {
  const report = {
    tripId: PILOT_IS_01_TRIP_ID,
    issues: [],
    verifiedAt: new Date().toISOString(),
    verifiedForTripVersion: planVersionId,
    currentTripVersion: planVersionId,
  };
  return {
    validate: jest.fn(async () => report),
    getReport: jest.fn(async () => report),
  };
}

@Controller('mobile/trips/:tripId')
class TepPilotMobileAcceptProbeController {
  constructor(
    private readonly access: ConstraintSolverAccessService,
    private readonly tepRepairApply: TepLocalRepairApplyService,
  ) {}

  @Post('execution/tep-repairs/:interventionId/accept')
  async acceptTepRepair(
    @Param('tripId') tripId: string,
    @Param('interventionId') interventionId: string,
    @Body() body: { optionId?: string; basePlanVersionId?: string },
  ) {
    const userId = TEP_PILOT_USER_ID;
    await this.access.assertTripMember(tripId, userId);
    const data = await this.tepRepairApply.applyRecoveryOption({
      tripId,
      interventionOrOptionId: body.optionId ?? interventionId,
      userId,
      basePlanVersionId: body.basePlanVersionId,
    });
    return { success: true, data };
  }
}

const describeHttp = isTepPilotHttpE2eEnabled() ? describe : describe.skip;

describeHttp('TEP pilot HTTP E2E (Nest)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const prevMat = process.env.RFC001_ITINERARY_MATERIALIZE;
  const accessMock = {
    resolveUserId: () => TEP_PILOT_USER_ID,
    assertTripMember: jest.fn(async () => ({ id: PILOT_IS_01_TRIP_ID })),
  };

  beforeAll(async () => {
    process.env.RFC001_ITINERARY_MATERIALIZE = '1';
    process.env.NODE_ENV = 'test';

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [PrismaModule],
      controllers: [ExecutabilityController, TepPilotMobileAcceptProbeController],
      providers: [
        ExecutabilityAssessmentService,
        TepOrchestratorService,
        WorldStateTepEvidenceService,
        EffectivePlanWriteGuardService,
        Rfc001PlanVersionStoreService,
        TepPlanMetadataService,
        Rfc001ItineraryMaterializerService,
        TepLocalRepairApplyService,
        TepRepairExecutionStore,
        { provide: ConstraintSolverAccessService, useValue: accessMock },
        TepOrchestratorService,
        WorldStateTepEvidenceService,
        EffectivePlanWriteGuardService,
        Rfc001PlanVersionStoreService,
        TepPlanMetadataService,
        Rfc001ItineraryMaterializerService,
        TepLocalRepairApplyService,
        TepRepairExecutionStore,
        {
          provide: FeasibilityReportService,
          useValue: buildPilotFeasibilityStub(PILOT_IS_01_PLAN_VERSION_ID),
        },
        {
          provide: WorldStateStoreService,
          useValue: {
            readStore: jest.fn(async () => ({
              assertions: [],
              snapshotId: 'ws_pilot_http_e2e',
              capturedAt: new Date().toISOString(),
            })),
          },
        },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();

    prisma = moduleRef.get(PrismaService);
    await prisma.$connect();

    const trip = await prisma.trip.findUnique({ where: { id: PILOT_IS_01_TRIP_ID } });
    if (!trip) {
      throw new Error(
        `Missing ${PILOT_IS_01_TRIP_ID} — run: npm run tep:pilot-seed -- --template=01 --reset`,
      );
    }
  }, 120_000);

  afterAll(async () => {
    if (prevMat === undefined) delete process.env.RFC001_ITINERARY_MATERIALIZE;
    else process.env.RFC001_ITINERARY_MATERIALIZE = prevMat;
    if (app) await app.close();
  });

  it('mobile tep-repairs/accept then GET executability?refresh=true', async () => {
    const beforeItem = await prisma.itineraryItem.findUnique({
      where: { id: PILOT_IS_01_ITEM_STOP },
    });
    if (!beforeItem) {
      throw new Error(`Item ${PILOT_IS_01_ITEM_STOP} missing before HTTP accept`);
    }

    const optionId = 'REPAIR-SDR101-D1-activity_stop_1';

    const acceptRes = await request(app.getHttpServer())
      .post(
        `/api/mobile/trips/${PILOT_IS_01_TRIP_ID}/execution/tep-repairs/intervention-tep-${optionId}/accept`,
      )
      .send({
        optionId,
        basePlanVersionId: PILOT_IS_01_PLAN_VERSION_ID,
      })
      .expect((res) => {
        expect([200, 201]).toContain(res.status);
      });

    expect(acceptRes.body.success).toBe(true);
    expect(acceptRes.body.data?.appliedAction).toBe('REMOVE');
    expect(acceptRes.body.data?.itineraryMaterialized).toBe(true);

    const afterItem = await prisma.itineraryItem.findUnique({
      where: { id: PILOT_IS_01_ITEM_STOP },
    });
    expect(afterItem).toBeNull();

    const getRes = await request(app.getHttpServer())
      .get(`/api/trips/${PILOT_IS_01_TRIP_ID}/executability`)
      .query({ refresh: 'true' })
      .expect(200);

    if (!getRes.body.success) {
      throw new Error(`GET executability failed: ${JSON.stringify(getRes.body)}`);
    }
    expect(getRes.body.data?.tripId).toBe(PILOT_IS_01_TRIP_ID);
    expect(getRes.body.data?.assessment?.status).toBeDefined();
    expect(Array.isArray(getRes.body.data?.planningDecisionProblems)).toBe(true);
  }, 90_000);
});

if (!isTepPilotHttpE2eEnabled()) {
  it('TEP pilot HTTP E2E skipped (set TEP_PILOT_HTTP_E2E=1 + DATABASE_URL)', () => {
    expect(isTepPilotHttpE2eEnabled()).toBe(false);
  });
}
