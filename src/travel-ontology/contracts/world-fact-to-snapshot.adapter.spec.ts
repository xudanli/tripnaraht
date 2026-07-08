import {
  projectTravelWorldFactToSnapshot,
} from './world-fact-to-snapshot.adapter';
import {
  TRAVEL_WORLD_FACT_SCHEMA_ID,
  TRAVEL_WORLD_PREDICATES,
} from './travel-world-fact.types';

describe('projectTravelWorldFactToSnapshot', () => {
  it('maps ontology fact to RFC-003 WorldFact', () => {
    const fact = {
      schemaId: TRAVEL_WORLD_FACT_SCHEMA_ID,
      factId: 'fact_test_1',
      subjectType: 'RentalVehicle',
      subjectId: 'veh_1',
      predicate: TRAVEL_WORLD_PREDICATES.HAS_DRIVETRAIN,
      value: '2WD',
      scope: { tripId: 'trip_1', country: 'IS' },
      authorityLevel: 'USER_BOOKING' as const,
      source: { provider: 'rental_order' },
      observedAt: '2026-07-05T10:00:00.000Z',
      confidence: 1,
      freshness: 'FRESH' as const,
      verificationStatus: 'VERIFIED' as const,
    };

    const projected = projectTravelWorldFactToSnapshot(fact);

    expect(projected.factId).toBe('fact_test_1');
    expect(projected.type).toBe('RentalVehicle.mobility.hasDrivetrain');
    expect(projected.kind).toBe('USER_DECLARED');
    expect(projected.authorityLevel).toBe('USER_BOOKING');
    expect(projected.value).toMatchObject({
      subjectId: 'veh_1',
      predicate: TRAVEL_WORLD_PREDICATES.HAS_DRIVETRAIN,
      payload: '2WD',
    });
  });
});
