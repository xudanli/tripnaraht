import { Test, TestingModule } from '@nestjs/testing';
import { ConstraintEngineService } from './constraint-engine.service';
import { ConstraintEvaluationGatewayService } from '../../../decision-runtime/constraints/constraint-evaluation.gateway.service';
import type { TripWorldState } from '../world-model';
import type { TripPlan } from '../plan-model';

describe('ConstraintEngineService — weather-outdoor-storm DecisionScope', () => {
  const prev = { ...process.env };
  let evaluatePlan: jest.Mock;

  beforeEach(async () => {
    process.env.CONSTRAINT_GATEWAY_MODE = 'ON_FOR_SELECTED';
    process.env.CONSTRAINT_GATEWAY_ON_SCENARIOS = 'weather-outdoor-storm';
    delete process.env.CONSTRAINT_CANDIDATE_FACADE;
    evaluatePlan = jest.fn().mockResolvedValue({
      schemaId: 'tripnara.canonical_constraint_report@v1',
      evaluationId: 'eval_mock',
      tripId: 'trip_storm',
      evaluatedAt: new Date().toISOString(),
      assertions: [],
      completeness: {
        weather: 'PARTIAL',
        roads: 'PARTIAL',
        hazards: 'MISSING',
        ferries: 'MISSING',
        openingHours: 'PARTIAL',
      },
      overallStatus: 'FEASIBLE',
      degraded: false,
      degradedReasons: [],
    });
  });

  afterEach(() => {
    process.env = { ...prev };
  });

  it('passes auto-built DecisionScope into Gateway evaluatePlan', async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ConstraintEngineService,
        {
          provide: ConstraintEvaluationGatewayService,
          useValue: { evaluatePlan, evaluateCandidate: evaluatePlan },
        },
      ],
    }).compile();

    const engine = module.get(ConstraintEngineService);
    const state = {
      context: {
        tripId: 'trip_storm',
        destination: 'IS',
        startDate: '2026-07-17',
        durationDays: 1,
        travelModeDefault: 'drive',
        preferences: { intents: {}, pace: 'moderate', riskTolerance: 'medium' },
      },
      candidatesByDate: {},
      signals: {
        lastUpdatedAt: new Date().toISOString(),
        weatherProhibitsOutdoor: true,
        affectedPlanItemIds: ['item_glacier'],
        worldStateSnapshotId: 'wss_storm_live',
        scopeMutationCandidate: {
          actionType: 'REPLACE_ITEM',
          targetObjectIds: ['item_glacier'],
        },
      },
      physical: { roadStates: [], hazardZones: [], ferryStates: [] },
    } as unknown as TripWorldState;

    const plan: TripPlan = {
      version: 't@v1',
      createdAt: new Date().toISOString(),
      tripId: 'trip_storm',
      days: [{ day: 1, date: '2026-07-17', timeSlots: [] }],
    };

    await engine.isFeasible(state, plan);

    expect(evaluatePlan).toHaveBeenCalled();
    const arg = evaluatePlan.mock.calls[0][0];
    expect(arg.decisionScope?.trigger).toBe('WEATHER_OUTDOOR_STORM');
    expect(arg.worldStateSnapshotId).toBe('wss_storm_live');
    expect(arg.scopeMutationCandidate?.actionType).toBe('REPLACE_ITEM');
    expect(arg.decisionScope?.mutableObjects.map((o: { id: string }) => o.id)).toContain(
      'item_glacier',
    );
  });
});
