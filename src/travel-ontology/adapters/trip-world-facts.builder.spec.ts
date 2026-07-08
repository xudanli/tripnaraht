import { buildTripContextWorldFacts } from './trip-world-facts.builder';
import { TRIP_CONTEXT_SNAPSHOT_SCHEMA_ID } from '../../decision-runtime/snapshot/contracts/trip-context-snapshot.types';
import {
  TRAVEL_WORLD_FACT_SCHEMA_ID,
  TRAVEL_WORLD_PREDICATES,
} from '../contracts/travel-world-fact.types';
import type { TripContextSnapshotView } from '../../decision-runtime/snapshot/contracts/trip-context-snapshot.types';
import { resolveTripExecutabilityStatus } from '../../travel-context/snapshot/adapters/trip-context.adapter-mappers';

describe('buildTripContextWorldFacts with tripOntologyFacts', () => {
  it('merges DB ontology facts with canonical road facts', () => {
    const tripView = {
      schemaId: TRIP_CONTEXT_SNAPSHOT_SCHEMA_ID,
      tripId: 'trip-1',
      createdAt: '2026-07-05T12:00:00.000Z',
      bindings: { dataCompletenessScore: 0.9 },
      worldFacts: {
        schemaId: 'tripnara.canonical_world_state_snapshot@v1',
        snapshotId: 'ws-1',
        tripId: 'trip-1',
        revision: '1',
        createdAt: '2026-07-05T12:00:00.000Z',
        weather: [],
        roads: [
          {
            roadId: 'IS-F208',
            segmentId: 'seg_f208',
            status: 'CLOSED' as const,
          },
        ],
        hazards: [],
        ferries: [],
        poiStates: [],
        travelMatrix: { matrixId: 'm1', entries: [] },
        completeness: { level: 'PARTIAL', missingDomains: [], staleDomains: [] },
        sourceVersions: [],
      },
      tripOntologyFacts: [
        {
          schemaId: TRAVEL_WORLD_FACT_SCHEMA_ID,
          factId: 'db_fact_1',
          subjectType: 'RentalVehicle',
          subjectId: 'veh_1',
          predicate: TRAVEL_WORLD_PREDICATES.HAS_DRIVETRAIN,
          value: '2WD',
          scope: { tripId: 'trip-1' },
          authorityLevel: 'USER_BOOKING',
          source: { provider: 'rental_order' },
          observedAt: '2026-07-05T12:00:00.000Z',
          confidence: 1,
          freshness: 'FRESH',
          verificationStatus: 'VERIFIED',
        },
      ],
    } as unknown as TripContextSnapshotView;

    const facts = buildTripContextWorldFacts(tripView);
    expect(facts.length).toBeGreaterThanOrEqual(2);
    expect(facts.some((f) => f.factId === 'db_fact_1')).toBe(true);
    expect(facts.some((f) => f.factId.startsWith('cws_road_'))).toBe(true);
  });
});

describe('resolveTripExecutabilityStatus', () => {
  const baseView = {
    effectivePlan: { hasEffectivePlan: true, dayCount: 5, itemCount: 10 },
    worldFacts: {},
    bindings: { dataCompletenessScore: 0.8 },
  } as unknown as TripContextSnapshotView;

  it('returns BLOCKED when ontologyConstraints has blockers', () => {
    expect(
      resolveTripExecutabilityStatus({
        ...baseView,
        ontologyConstraints: { blockerCount: 1, warningCount: 0, missingEvidenceCount: 0, codes: ['X'] },
      }),
    ).toBe('BLOCKED');
  });

  it('returns EXECUTABLE when no blockers and plan exists', () => {
    expect(resolveTripExecutabilityStatus(baseView)).toBe('EXECUTABLE');
  });
});
