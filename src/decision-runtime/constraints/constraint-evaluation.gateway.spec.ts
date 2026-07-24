import { Test, TestingModule } from '@nestjs/testing';
import type { TripPlan } from '../../trips/decision/plan-model';
import type { TripWorldState } from '../../trips/decision/world-model';
import { ConstraintEvaluationGatewayService } from './constraint-evaluation.gateway.service';
import { ConstraintFailurePolicyService } from './failure-policy.service';
import { LegacyConstraintCheckerAdapter } from './providers/legacy-checker.provider';
import { GuardianConstraintProvider } from './providers/guardian-constraint.provider';
import { DestinationPackConstraintProvider } from './providers/destination-pack.provider';
import {
  isLegacyFeasibleFromReport,
} from './contracts/canonical-constraint-report';
import { deriveOverallStatus } from './assertion-normalizer.service';
import {
  evaluateWorldStateCompleteness,
  planRequiresRoadData,
} from './world-state/completeness-evaluator.util';
import { buildCompletenessAssertions } from './world-state/reality-completeness.provider';

function buildDrivePlan(): TripPlan {
  return {
    version: 'test@v1',
    createdAt: new Date().toISOString(),
    tripId: 'trip_test',
    days: [
      {
        day: 1,
        date: '2026-07-01',
        timeSlots: [
          {
            id: 'slot_1',
            time: '09:00',
            title: 'Drive segment',
            type: 'transport',
            travelLegFromPrev: {
              mode: 'drive',
              from: { lat: 64.1, lng: -21.9 },
              to: { lat: 64.2, lng: -21.8 },
              durationMin: 45,
            },
          },
        ],
      },
    ],
  };
}

function buildWorldStateWithEmptyRoads(): TripWorldState {
  return {
    context: {
      tripId: 'trip_test',
      destination: 'IS',
      startDate: '2026-07-01',
      durationDays: 1,
      travelModeDefault: 'drive',
      preferences: {
        intents: {},
        pace: 'moderate',
        riskTolerance: 'medium',
      },
    },
    candidatesByDate: {},
    signals: { lastUpdatedAt: new Date().toISOString() },
    physical: {
      roadStates: [],
      hazardZones: [],
      ferryStates: [],
    },
  } as TripWorldState;
}

describe('completeness-evaluator.util', () => {
  it('treats empty roadStates without LOADED marker as MISSING', () => {
    const plan = buildDrivePlan();
    const worldState = buildWorldStateWithEmptyRoads();
    const completeness = evaluateWorldStateCompleteness({ worldState, plan });
    expect(completeness.roads).toBe('MISSING');
    expect(planRequiresRoadData(plan, worldState)).toBe(true);
  });

  it('treats empty roadStates with LOADED marker as COMPLETE', () => {
    const plan = buildDrivePlan();
    const worldState = buildWorldStateWithEmptyRoads();
    const completeness = evaluateWorldStateCompleteness({
      worldState,
      plan,
      dataAvailability: { roads: 'LOADED' },
    });
    expect(completeness.roads).toBe('COMPLETE');
  });
});

describe('reality-completeness.provider', () => {
  it('emits REQUIRES_VERIFICATION when road data missing for drive plan', () => {
    const plan = buildDrivePlan();
    const worldState = buildWorldStateWithEmptyRoads();
    const completeness = evaluateWorldStateCompleteness({ worldState, plan });
    const assertions = buildCompletenessAssertions({
      tripId: 'trip_test',
      completeness,
      plan,
      worldState,
    });
    expect(assertions.some((a) => a.status === 'REQUIRES_VERIFICATION')).toBe(true);
    expect(assertions.some((a) => a.reasonCode === 'ROAD_DATA_NOT_LOADED')).toBe(true);
  });
});

describe('deriveOverallStatus', () => {
  it('marks UNVERIFIED when REQUIRES_VERIFICATION present without BLOCK', () => {
    const status = deriveOverallStatus([
      {
        assertionId: 'a1',
        constraintType: 'ROAD_STATE_DATA',
        status: 'REQUIRES_VERIFICATION',
        severity: 'CRITICAL',
        scope: { tripId: 't1' },
        reasonCode: 'ROAD_DATA_NOT_LOADED',
        evidenceRefs: [],
        message: 'test',
        evaluator: { engine: 'test', version: '0' },
      },
    ]);
    expect(status).toBe('UNVERIFIED');
  });
});

describe('ConstraintEvaluationGatewayService', () => {
  let gateway: ConstraintEvaluationGatewayService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ConstraintEvaluationGatewayService,
        ConstraintFailurePolicyService,
        {
          provide: LegacyConstraintCheckerAdapter,
          useValue: { evaluate: jest.fn().mockResolvedValue([]) },
        },
        GuardianConstraintProvider,
        DestinationPackConstraintProvider,
      ],
    }).compile();

    gateway = module.get(ConstraintEvaluationGatewayService);
  });

  it('returns UNVERIFIED (not FEASIBLE) when roadStates empty and plan drives', async () => {
    const plan = buildDrivePlan();
    const worldState = buildWorldStateWithEmptyRoads();

    const report = await gateway.evaluatePlan({
      tripId: 'trip_test',
      plan,
      worldState,
    });

    expect(report.overallStatus).toBe('UNVERIFIED');
    expect(report.completeness.roads).toBe('MISSING');
    expect(isLegacyFeasibleFromReport(report)).toBe(false);
  });

  it('legacy boolean compat returns false for UNVERIFIED drive plan', async () => {
    const plan = buildDrivePlan();
    const worldState = buildWorldStateWithEmptyRoads();

    const feasible = await gateway.isFeasibleLegacyCompat({
      tripId: 'trip_test',
      plan,
      worldState,
    });

    expect(feasible).toBe(false);
  });
});
