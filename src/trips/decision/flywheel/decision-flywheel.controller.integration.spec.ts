import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { DecisionFlywheelController } from './decision-flywheel.controller';
import { ParallelDecisionKernelService } from '../../../decision/kernel/parallel-decision-kernel.service';
import { DecisionAuditService } from './decision-audit.service';
import { InterventionEngine } from '../../../decision/actuator/intervention-engine';

jest.setTimeout(60000);

describe('DecisionFlywheelController (integration)', () => {
  let app: INestApplication;
  let kernelSvc: ParallelDecisionKernelService;

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [DecisionFlywheelController],
      providers: [
        ParallelDecisionKernelService,
        InterventionEngine,
        {
          provide: DecisionAuditService,
          useValue: {
            getRecentSignals: jest.fn().mockResolvedValue([]),
            logRiskFeedback: jest.fn().mockResolvedValue({ id: null }),
            logShadowDecision: jest.fn().mockResolvedValue({ id: null }),
            updateConsensusEmergency: jest
              .fn()
              .mockResolvedValue({ isEmergency: false, state: { isEmergency: false } }),
          },
        },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
    kernelSvc = moduleRef.get(ParallelDecisionKernelService);
  });

  afterAll(async () => {
    // Ensure worker threads are terminated to avoid open handles in Jest.
    await kernelSvc?.kernel?.close();
    await app?.close();
  }, 60000);

  it('POST /decision/flywheel/predict returns aggregate + failureDrivers', async () => {
    const samples = Array.from({ length: 50 }).map((_, i) => ({
      sampleId: `s${i}`,
      weight: 1,
      environmentSummary: { weatherRisk: i < 5 ? 0.95 : 0.2 },
    }));
    const edges = [
      {
        edge: {
          id: 'e1',
          from: 'A',
          to: 'B',
          travel_time: 5,
          road_open: 1,
          exposure: 1,
          surface_type: 'mud',
          water_crossing_depth_cm: 80,
          f_road_level: 'F208',
        },
      },
    ];

    const res = await request(app.getHttpServer())
      .post('/decision/flywheel/predict')
      .send({
        samples,
        edges,
        envDefaults: { weatherRisk01: 0.2, windSpeedMs: 18.2 },
        alpha: 0.95,
        beta: 0.5,
        targetReducedN: 20,
        topMEdges: 1,
        context: { userId: 'u1', region: 'Iceland_South', countryCode: 'IS', month: 4, vehicleClass: 'SUV' },
      })
      .expect(201);

    expect(res.body.aggregate).toBeDefined();
    expect(res.body.failureDrivers).toBeDefined();
    expect(res.body.failureDrivers.topEdges.length).toBe(1);
  }, 60000);

  it('POST /decision/flywheel/risk-feedback returns calibrationSignals', async () => {
    const edges = [
      {
        edge: {
          id: 'e1',
          from: 'A',
          to: 'B',
          travel_time: 5,
          road_open: 1,
          water_crossing_depth_cm: 80,
          surface_type: 'mud',
          steepness_grade_pct: 25,
          exposure: 1,
        },
      },
    ];
    const res = await request(app.getHttpServer())
      .post('/decision/flywheel/risk-feedback')
      .send({
        itineraryId: 'it-1',
        userId: 'u1',
        context: { region: 'Iceland_South', countryCode: 'IS', month: 4, vehicleClass: 'SUV' },
        weatherRisk01: 0.9,
        windSpeedMs: 18.2,
        edges,
        observed: [{ edgeId: 'e1', observedWaterDepthCm: 10, avgSpeedKmh: 45 }],
      })
      .expect(201);

    expect(res.body.status).toBe('LEARNED');
    expect(Array.isArray(res.body.calibrationSignals)).toBe(true);
  }, 60000);
});

