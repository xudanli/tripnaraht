import { Test, TestingModule } from '@nestjs/testing';
import { ConstraintEvaluationGatewayService } from './constraint-evaluation.gateway.service';
import { ConstraintFailurePolicyService } from './failure-policy.service';
import { LegacyConstraintCheckerAdapter } from './providers/legacy-checker.provider';
import { GuardianConstraintProvider } from './providers/guardian-constraint.provider';
import { DestinationPackConstraintProvider } from './providers/destination-pack.provider';
import { OntologyConstraintProvider } from './providers/ontology-constraint.provider';
import { getOntologyDecisionScenario } from '../../harness/evals/fixtures/ontology-world-model/ontology-decision-scenarios.registry';

describe('ConstraintEvaluationGatewayService — Ontology snapshotWorldFacts', () => {
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

  it('ONT-SCENARIO-004 emits ENTRY_ELIGIBILITY_UNKNOWN via snapshotWorldFacts', async () => {
    const fixture = getOntologyDecisionScenario('ONT-SCENARIO-004-VISA-UNCONFIRMED')!;

    const report = await gateway.evaluatePlan({
      tripId: fixture.snapshot.identity.tripId!,
      plan: {
        version: 'harness@v1',
        createdAt: new Date().toISOString(),
        tripId: fixture.snapshot.identity.tripId!,
        days: [{ day: 1, date: '2026-07-01', timeSlots: [] }],
      },
      worldState: {
        context: {
          tripId: fixture.snapshot.identity.tripId!,
          destination: 'IS',
          startDate: '2026-07-01',
          durationDays: 5,
          travelModeDefault: 'mixed',
          preferences: { intents: {}, pace: 'moderate', riskTolerance: 'medium' },
        },
        candidatesByDate: {},
        signals: { lastUpdatedAt: new Date().toISOString() },
        physical: { roadStates: [], hazardZones: [], ferryStates: [] },
      } as never,
      snapshotWorldFacts: fixture.snapshot.world.facts,
      skipLegacyChecker: true,
      evaluationMode: 'PLAN_VERIFY',
    });

    const ontologyAssertions = report.assertions.filter(
      (a) => a.constraintType === 'TRAVEL_ONTOLOGY',
    );
    expect(ontologyAssertions.some((a) => a.reasonCode === 'ENTRY_ELIGIBILITY_UNKNOWN')).toBe(true);
    expect(ontologyAssertions.some((a) => a.reasonCode === 'VISA_STATUS_UNCONFIRMED')).toBe(true);
  });

  it('ONT-SCENARIO-001 emits VEHICLE_CAPABILITY_MISMATCH via snapshotWorldFacts', async () => {
    const fixture = getOntologyDecisionScenario('ONT-SCENARIO-001-VEHICLE-ROUTE-MISMATCH')!;

    const report = await gateway.evaluatePlan({
      tripId: fixture.snapshot.identity.tripId!,
      plan: {
        version: 'harness@v1',
        createdAt: new Date().toISOString(),
        tripId: fixture.snapshot.identity.tripId!,
        days: [{ day: 1, date: '2026-07-01', timeSlots: [] }],
      },
      worldState: {
        context: {
          tripId: fixture.snapshot.identity.tripId!,
          destination: 'IS',
          startDate: '2026-07-01',
          durationDays: 5,
          travelModeDefault: 'mixed',
          preferences: { intents: {}, pace: 'moderate', riskTolerance: 'medium' },
        },
        candidatesByDate: {},
        signals: { lastUpdatedAt: new Date().toISOString() },
        physical: { roadStates: [], hazardZones: [], ferryStates: [] },
      } as never,
      snapshotWorldFacts: fixture.snapshot.world.facts,
      skipLegacyChecker: true,
      evaluationMode: 'PLAN_VERIFY',
    });

    const codes = report.assertions
      .filter((a) => a.constraintType === 'TRAVEL_ONTOLOGY')
      .map((a) => a.reasonCode);
    expect(codes).toContain('VEHICLE_CAPABILITY_MISMATCH');
  });
});
