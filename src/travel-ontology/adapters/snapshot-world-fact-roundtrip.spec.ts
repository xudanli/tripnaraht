import {
  projectTravelWorldFactToSnapshot,
  projectTravelWorldFactsToSnapshot,
} from '../contracts/world-fact-to-snapshot.adapter';
import { TRAVEL_WORLD_PREDICATES, TRAVEL_WORLD_FACT_SCHEMA_ID } from '../contracts/travel-world-fact.types';
import { parseTravelWorldFactsFromSnapshot } from './snapshot-world-fact.adapter';
import { evaluateOntologyConstraints } from '../evaluators/ontology-constraint.evaluator';

describe('ontology fact roundtrip + vehicle scenario', () => {
  it('preserves prohibited road class through snapshot projection', () => {
    const facts = [
      {
        schemaId: TRAVEL_WORLD_FACT_SCHEMA_ID,
        factId: 'f1',
        subjectType: 'RentalVehicle',
        subjectId: 'veh_1',
        predicate: TRAVEL_WORLD_PREDICATES.HAS_DRIVETRAIN,
        value: '2WD',
        scope: {},
        authorityLevel: 'USER_BOOKING' as const,
        source: { provider: 'x' },
        observedAt: '2026-07-05T10:00:00.000Z',
        confidence: 1,
        freshness: 'FRESH' as const,
        verificationStatus: 'VERIFIED' as const,
      },
      {
        schemaId: TRAVEL_WORLD_FACT_SCHEMA_ID,
        factId: 'f2',
        subjectType: 'RentalContract',
        subjectId: 'c1',
        predicate: TRAVEL_WORLD_PREDICATES.PROHIBITED_ROAD_CLASS,
        value: 'F_ROAD',
        scope: {},
        authorityLevel: 'USER_BOOKING' as const,
        source: { provider: 'x' },
        observedAt: '2026-07-05T10:00:00.000Z',
        confidence: 1,
        freshness: 'FRESH' as const,
        verificationStatus: 'VERIFIED' as const,
      },
      {
        schemaId: TRAVEL_WORLD_FACT_SCHEMA_ID,
        factId: 'f3',
        subjectType: 'RouteSegment',
        subjectId: 'seg_1',
        predicate: TRAVEL_WORLD_PREDICATES.REQUIRED_VEHICLE_CAPABILITY,
        value: '4WD',
        scope: {},
        authorityLevel: 'OFFICIAL_OPERATOR' as const,
        source: { provider: 'x' },
        observedAt: '2026-07-05T10:00:00.000Z',
        confidence: 1,
        freshness: 'FRESH' as const,
        verificationStatus: 'VERIFIED' as const,
      },
    ];

    const projected = projectTravelWorldFactsToSnapshot(facts);
    const parsed = parseTravelWorldFactsFromSnapshot(projected);
    expect(parsed).toHaveLength(3);

    const { results } = evaluateOntologyConstraints(parsed);
    expect(results.map((r) => r.code)).toEqual(
      expect.arrayContaining(['VEHICLE_CAPABILITY_MISMATCH', 'RENTAL_CONTRACT_ROAD_PROHIBITION']),
    );
  });
});
