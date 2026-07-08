import { TRAVEL_WORLD_PREDICATES, TRAVEL_WORLD_FACT_SCHEMA_ID } from '../contracts/travel-world-fact.types';
import { projectTravelWorldFactsToSnapshot } from '../contracts/world-fact-to-snapshot.adapter';
import { parseTravelWorldFactsFromSnapshot } from '../adapters/snapshot-world-fact.adapter';
import { evaluateOntologyConstraints } from './ontology-constraint.evaluator';

describe('evaluateOntologyConstraints', () => {
  const vehicleScenarioFacts = [
    {
      schemaId: TRAVEL_WORLD_FACT_SCHEMA_ID,
      factId: 'f1',
      subjectType: 'RentalVehicle',
      subjectId: 'veh_yaris',
      predicate: TRAVEL_WORLD_PREDICATES.HAS_DRIVETRAIN,
      value: '2WD',
      scope: { tripId: 'trip_1' },
      authorityLevel: 'USER_BOOKING' as const,
      source: { provider: 'rental_order' },
      observedAt: '2026-07-05T10:00:00.000Z',
      confidence: 1,
      freshness: 'FRESH' as const,
      verificationStatus: 'VERIFIED' as const,
    },
    {
      schemaId: TRAVEL_WORLD_FACT_SCHEMA_ID,
      factId: 'f2',
      subjectType: 'RentalContract',
      subjectId: 'contract_1',
      predicate: TRAVEL_WORLD_PREDICATES.PROHIBITED_ROAD_CLASS,
      value: 'F_ROAD',
      scope: { tripId: 'trip_1' },
      authorityLevel: 'USER_BOOKING' as const,
      source: { provider: 'rental_contract' },
      observedAt: '2026-07-05T10:00:00.000Z',
      confidence: 1,
      freshness: 'FRESH' as const,
      verificationStatus: 'VERIFIED' as const,
    },
    {
      schemaId: TRAVEL_WORLD_FACT_SCHEMA_ID,
      factId: 'f3',
      subjectType: 'RouteSegment',
      subjectId: 'seg_f208',
      predicate: TRAVEL_WORLD_PREDICATES.REQUIRED_VEHICLE_CAPABILITY,
      value: '4WD',
      scope: { country: 'IS' },
      authorityLevel: 'OFFICIAL_OPERATOR' as const,
      source: { provider: 'road-is' },
      observedAt: '2026-07-05T10:00:00.000Z',
      confidence: 0.95,
      freshness: 'FRESH' as const,
      verificationStatus: 'VERIFIED' as const,
    },
  ];

  it('场景一：2WD + F-road → BLOCK', () => {
    const parsed = parseTravelWorldFactsFromSnapshot(
      projectTravelWorldFactsToSnapshot(vehicleScenarioFacts),
    );
    const { results } = evaluateOntologyConstraints(parsed);
    const codes = results.map((r) => r.code);
    expect(codes).toContain('VEHICLE_CAPABILITY_MISMATCH');
    expect(codes).toContain('RENTAL_CONTRACT_ROAD_PROHIBITION');
  });

  it('场景二：涉水路线 + 保险缺口', () => {
    const facts = [
      {
        schemaId: TRAVEL_WORLD_FACT_SCHEMA_ID,
        factId: 'ins1',
        subjectType: 'InsurancePolicy',
        subjectId: 'policy_1',
        predicate: TRAVEL_WORLD_PREDICATES.COVERS_DAMAGE_CAUSE,
        value: ['collision', 'gravel'],
        scope: {},
        authorityLevel: 'USER_BOOKING' as const,
        source: { provider: 'insurance' },
        observedAt: '2026-07-05T10:00:00.000Z',
        confidence: 0.9,
        freshness: 'FRESH' as const,
        verificationStatus: 'VERIFIED' as const,
      },
      {
        schemaId: TRAVEL_WORLD_FACT_SCHEMA_ID,
        factId: 'seg1',
        subjectType: 'RouteSegment',
        subjectId: 'seg_river',
        predicate: 'route.hasRiverCrossing',
        value: true,
        scope: {},
        authorityLevel: 'OFFICIAL_OPERATOR' as const,
        source: { provider: 'road-is' },
        observedAt: '2026-07-05T10:00:00.000Z',
        confidence: 0.95,
        freshness: 'FRESH' as const,
        verificationStatus: 'VERIFIED' as const,
      },
    ];
    const { results } = evaluateOntologyConstraints(facts);
    expect(results.some((r) => r.code === 'INSURANCE_WATER_CROSSING_GAP')).toBe(true);
    expect(results.some((r) => r.code === 'INSURANCE_UNDERCARRIAGE_UNKNOWN')).toBe(true);
  });
});
