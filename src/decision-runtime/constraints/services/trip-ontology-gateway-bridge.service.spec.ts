import { TripOntologyGatewayBridgeService } from './trip-ontology-gateway-bridge.service';
import { ConstraintEvaluationGatewayService } from '../constraint-evaluation.gateway.service';

describe('TripOntologyGatewayBridgeService', () => {
  it('forwards explicit snapshotWorldFacts to gateway evaluatePlan', async () => {
    const worldFacts = [
      {
        factId: 'f1',
        type: 'immigration.entryEligibility',
        kind: 'USER_DECLARED',
        value: { status: 'UNKNOWN', visaRequired: true },
        observedAt: '2026-07-05T10:00:00.000Z',
        sourceId: 'test',
        authorityLevel: 'USER_DECLARATION',
        confidence: 0.5,
      },
    ];

    const gateway = {
      evaluatePlan: jest.fn(async () => ({
        assertions: [{ constraintType: 'TRAVEL_ONTOLOGY', reasonCode: 'ENTRY_ELIGIBILITY_UNKNOWN' }],
      })),
    };

    const service = new TripOntologyGatewayBridgeService(
      gateway as unknown as ConstraintEvaluationGatewayService,
    );

    await service.evaluatePlanWithOntologyFacts({
      tripId: 'trip_1',
      plan: {
        version: 'test@v1',
        createdAt: new Date().toISOString(),
        tripId: 'trip_1',
        days: [],
      },
      worldState: {
        context: {
          tripId: 'trip_1',
          destination: 'IS',
          startDate: '2026-07-01',
          durationDays: 1,
          travelModeDefault: 'mixed',
          preferences: { intents: {}, pace: 'moderate', riskTolerance: 'medium' },
        },
        candidatesByDate: {},
        signals: { lastUpdatedAt: new Date().toISOString() },
        physical: { roadStates: [], hazardZones: [], ferryStates: [] },
      } as never,
      snapshotWorldFacts: worldFacts as never,
    });

    expect(gateway.evaluatePlan).toHaveBeenCalledWith(
      expect.objectContaining({
        tripId: 'trip_1',
        snapshotWorldFacts: worldFacts,
        skipLegacyChecker: true,
      }),
    );
  });
});
