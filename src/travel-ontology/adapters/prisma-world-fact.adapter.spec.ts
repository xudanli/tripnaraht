import {
  prismaWorldFactRowToTravelWorldFact,
} from './prisma-world-fact.adapter';
import { tripWorldFactKey, parseTripIdFromWorldFactKey } from '../../world-facts/world-fact-trip.util';
import { TRAVEL_WORLD_PREDICATES, TRAVEL_WORLD_FACT_SCHEMA_ID } from '../contracts/travel-world-fact.types';

describe('prismaWorldFactRowToTravelWorldFact', () => {
  it('maps DB row with payload in valueJson', () => {
    const fact = prismaWorldFactRowToTravelWorldFact({
      id: 'wf_1',
      factKey: 'trip:trip_1:vehicle_drivetrain',
      subjectType: 'RentalVehicle',
      subjectId: 'veh_1',
      predicate: TRAVEL_WORLD_PREDICATES.HAS_DRIVETRAIN,
      valueJson: {
        payload: '2WD',
        scope: { tripId: 'trip_1' },
      },
      confidence: 0.95,
      severity: null,
      sourceType: 'user_booking',
      sourceRef: 'order_123',
      validFrom: null,
      validTo: null,
      observedAt: new Date('2026-07-05T10:00:00.000Z'),
      snapshotVersion: 'trip:trip_1',
      supersedesFactId: null,
      createdAt: new Date('2026-07-05T10:00:00.000Z'),
    });

    expect(fact.factId).toBe('wf_1');
    expect(fact.schemaId).toBe(TRAVEL_WORLD_FACT_SCHEMA_ID);
    expect(fact.value).toBe('2WD');
    expect(fact.scope.tripId).toBe('trip_1');
    expect(fact.authorityLevel).toBe('USER_BOOKING');
  });
});

describe('tripWorldFactKey', () => {
  it('builds and parses trip-scoped keys', () => {
    const key = tripWorldFactKey('trip_abc', 'rental_drivetrain');
    expect(key).toBe('trip:trip_abc:rental_drivetrain');
    expect(parseTripIdFromWorldFactKey(key)).toBe('trip_abc');
  });
});
