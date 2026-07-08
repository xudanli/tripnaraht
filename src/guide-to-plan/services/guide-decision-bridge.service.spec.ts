import { GuideDecisionBridgeService } from './guide-decision-bridge.service';
import { guideDraftToTripPlan } from '../utils/guide-draft-to-trip-plan.util';

describe('guideDraftToTripPlan', () => {
  it('maps draft days to TripPlan timeSlots', () => {
    const plan = guideDraftToTripPlan({
      draft: {
        totalDays: 1,
        variant: 'balanced',
        sourceConfidence: 0.8,
        warnings: [],
        days: [
          {
            day: 1,
            date: '2026-08-01',
            items: [
              {
                name: '蓝湖',
                type: 'poi',
                source: 'guide',
                startTime: '10:00',
                endTime: '12:00',
                travelMinutesFromPrev: 30,
              },
            ],
            activityCount: 1,
          },
        ],
      },
      travelModeDefault: 'drive',
    });

    expect(plan.days[0].timeSlots).toHaveLength(1);
    expect(plan.days[0].timeSlots[0].travelLegFromPrev?.mode).toBe('drive');
  });
});

describe('GuideDecisionBridgeService', () => {
  const originalLegacy = process.env.GUIDE_DECISION_ENGINE_ENABLED;
  const originalGateway = process.env.GUIDE_CONSTRAINT_GATEWAY_ENABLED;

  afterEach(() => {
    if (originalLegacy === undefined) delete process.env.GUIDE_DECISION_ENGINE_ENABLED;
    else process.env.GUIDE_DECISION_ENGINE_ENABLED = originalLegacy;
    if (originalGateway === undefined) delete process.env.GUIDE_CONSTRAINT_GATEWAY_ENABLED;
    else process.env.GUIDE_CONSTRAINT_GATEWAY_ENABLED = originalGateway;
  });

  it('skips by default', async () => {
    delete process.env.GUIDE_DECISION_ENGINE_ENABLED;
    delete process.env.GUIDE_CONSTRAINT_GATEWAY_ENABLED;
    const service = new GuideDecisionBridgeService({ $queryRaw: jest.fn() } as any, undefined);
    const result = await service.enhanceDraft({
      countryCode: 'IS',
      itineraryDraft: {
        totalDays: 1,
        days: [{ day: 1, items: [{ name: '蓝湖', type: 'poi', source: 'guide' }] }],
        warnings: [],
      },
    });
    expect(result.engineApplied).toBe(false);
  });

  it('uses constraint gateway when GUIDE_CONSTRAINT_GATEWAY_ENABLED=1', async () => {
    process.env.GUIDE_CONSTRAINT_GATEWAY_ENABLED = '1';
    const gateway = {
      evaluatePlan: jest.fn().mockResolvedValue({
        schemaId: 'tripnara.canonical_constraint_report@v1',
        tripId: 'guide',
        evaluatedAt: new Date().toISOString(),
        overallStatus: 'UNVERIFIED',
        assertions: [
          {
            status: 'REQUIRES_VERIFICATION',
            message: '道路状态未加载',
            reasonCode: 'ROAD_DATA_NOT_LOADED',
          },
        ],
        completeness: { roads: 'MISSING', weather: 'MISSING', hazards: 'MISSING', ferries: 'MISSING', openingHours: 'MISSING' },
        degraded: false,
        degradedReasons: [],
      }),
    };
    const service = new GuideDecisionBridgeService({ $queryRaw: jest.fn() } as any, undefined);
    (service as unknown as { constraintGateway: typeof gateway }).constraintGateway = gateway;

    const result = await service.enhanceDraft({
      countryCode: 'IS',
      travelContext: { startDate: '2026-08-01', countryCode: 'IS' },
      itineraryDraft: {
        totalDays: 1,
        variant: 'balanced',
        sourceConfidence: 0.8,
        days: [
          {
            day: 1,
            date: '2026-08-01',
            items: [
              {
                name: '蓝湖',
                type: 'poi',
                source: 'guide',
                startTime: '10:00',
                endTime: '12:00',
                travelMinutesFromPrev: 40,
              },
            ],
            activityCount: 1,
            drivingMinutesEstimate: 40,
          },
        ],
        warnings: [],
      },
    });

    expect(result.engineApplied).toBe(true);
    expect(result.additionalWarnings.length).toBeGreaterThan(0);
    expect(result.overallStatus).toBe('UNVERIFIED');
  });
});
