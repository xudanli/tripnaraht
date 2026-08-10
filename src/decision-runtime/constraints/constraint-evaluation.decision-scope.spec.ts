import { Test, TestingModule } from '@nestjs/testing';
import { ConstraintEvaluationGatewayService } from './constraint-evaluation.gateway.service';
import { ConstraintFailurePolicyService } from './failure-policy.service';
import { LegacyConstraintCheckerAdapter } from './providers/legacy-checker.provider';
import { GuardianConstraintProvider } from './providers/guardian-constraint.provider';
import { DestinationPackConstraintProvider } from './providers/destination-pack.provider';
import { OntologyConstraintProvider } from './providers/ontology-constraint.provider';
import { buildWindDecisionScope } from '../builders/build-wind-decision-scope';
import type { TravelWorldStateSnapshot } from '../contracts/world-state-snapshot';
import { DECISION_SCOPE_VIOLATION } from '../verification/evaluate-decision-scope.util';
import type { TripPlan } from '../../trips/decision/plan-model';
import type { TripWorldState } from '../../trips/decision/world-model';

function stubSnapshot(): TravelWorldStateSnapshot {
  return {
    schemaId: 'tripnara.canonical_world_state_snapshot@v1',
    snapshotId: 'ws_gw_scope_1',
    tripId: 'trip_gw_scope',
    revision: '1',
    createdAt: '2026-07-17T09:45:00.000Z',
    weather: [],
    roads: [{ roadId: '1', segmentId: 'seg_1', status: 'OPEN' }],
    hazards: [],
    ferries: [],
    poiStates: [],
    travelMatrix: { matrixId: 'm1', entries: [] },
    completeness: {
      weather: 'PARTIAL',
      roads: 'PARTIAL',
      hazards: 'MISSING',
      ferries: 'MISSING',
      openingHours: 'PARTIAL',
    },
    sourceVersions: [],
  };
}

describe('ConstraintEvaluationGatewayService — DecisionScope', () => {
  let gateway: ConstraintEvaluationGatewayService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ConstraintEvaluationGatewayService,
        ConstraintFailurePolicyService,
        OntologyConstraintProvider,
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

  it('emits DECISION_SCOPE_VIOLATION when candidate outside scope', async () => {
    const snap = stubSnapshot();
    const scope = buildWindDecisionScope({ snapshot: snap });
    const plan: TripPlan = {
      version: 't@v1',
      createdAt: snap.createdAt,
      tripId: snap.tripId,
      days: [{ day: 1, date: '2026-07-17', timeSlots: [] }],
    };
    const worldState = {
      context: {
        tripId: snap.tripId,
        destination: 'IS',
        startDate: '2026-07-17',
        durationDays: 1,
        travelModeDefault: 'drive',
        preferences: { intents: {}, pace: 'moderate', riskTolerance: 'medium' },
      },
      candidatesByDate: {},
      signals: { lastUpdatedAt: snap.createdAt },
      physical: { roadStates: [], hazardZones: [], ferryStates: [] },
    } as TripWorldState;

    const report = await gateway.evaluateCandidate({
      tripId: snap.tripId,
      candidateId: 'cand_out_of_scope',
      plan,
      worldState,
      skipLegacyChecker: true,
      decisionScope: scope,
      worldStateSnapshotId: snap.snapshotId,
      scopeMutationCandidate: {
        actionType: 'MOVE_DAY',
        targetObjectIds: ['act_glacier'],
      },
      dataAvailability: {
        roads: 'LOADED',
        weather: 'LOADED',
        hazards: 'LOADED',
        ferries: 'LOADED',
        openingHours: 'LOADED',
      },
    });

    expect(
      report.assertions.some((a) => a.reasonCode === DECISION_SCOPE_VIOLATION),
    ).toBe(true);
    expect(report.overallStatus).toBe('INFEASIBLE');
  });
});
