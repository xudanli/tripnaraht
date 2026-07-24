import {
  projectOntologyIssuesFromWorldFacts,
  projectOntologyIssuesFromTripView,
} from '../projections/ontology-issues.projection';
import { projectTravelWorldFactsToSnapshot } from '../contracts/world-fact-to-snapshot.adapter';
import { TRAVEL_WORLD_FACT_SCHEMA_ID, TRAVEL_WORLD_PREDICATES } from '../contracts/travel-world-fact.types';
import { TRIP_CONTEXT_SNAPSHOT_SCHEMA_ID } from '../../decision-runtime/snapshot/contracts/trip-context-snapshot.types';
import type { TripContextSnapshotView } from '../../decision-runtime/snapshot/contracts/trip-context-snapshot.types';

describe('ontology-issues.projection', () => {
  const vehicleFacts = [
    {
      schemaId: TRAVEL_WORLD_FACT_SCHEMA_ID,
      factId: 'f1',
      subjectType: 'RentalVehicle',
      subjectId: 'veh_1',
      predicate: TRAVEL_WORLD_PREDICATES.HAS_DRIVETRAIN,
      value: '2WD',
      scope: { tripId: 'trip_1' },
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
      subjectType: 'RouteSegment',
      subjectId: 'seg_f208',
      predicate: TRAVEL_WORLD_PREDICATES.REQUIRED_VEHICLE_CAPABILITY,
      value: '4WD',
      scope: { tripId: 'trip_1' },
      authorityLevel: 'OFFICIAL_OPERATOR' as const,
      source: { provider: 'x' },
      observedAt: '2026-07-05T10:00:00.000Z',
      confidence: 1,
      freshness: 'FRESH' as const,
      verificationStatus: 'VERIFIED' as const,
    },
  ];

  it('projects BLOCK issues from snapshot world facts', () => {
    const issues = projectOntologyIssuesFromWorldFacts({
      tripId: 'trip_1',
      worldFacts: projectTravelWorldFactsToSnapshot(vehicleFacts),
    });
    expect(issues.some((i) => i.severity === 'BLOCK')).toBe(true);
    expect(issues[0]?.source.gatewayAssessmentBatchId).toBe('travel-ontology-evaluator');
  });

  it('projects from trip view tripOntologyFacts', () => {
    const view = {
      schemaId: TRIP_CONTEXT_SNAPSHOT_SCHEMA_ID,
      tripId: 'trip_1',
      createdAt: '2026-07-05T12:00:00.000Z',
      bindings: { worldSnapshotId: 'ws_1', dataCompletenessScore: 0.9, constraintsVersion: 1 },
      worldFacts: {
        schemaId: 'tripnara.canonical_world_state_snapshot@v1',
        snapshotId: 'ws_1',
        tripId: 'trip_1',
        revision: '1',
        createdAt: '2026-07-05T12:00:00.000Z',
        weather: [],
        roads: [],
        hazards: [],
        ferries: [],
        poiStates: [],
        travelMatrix: { matrixId: 'm', entries: [] },
        completeness: { level: 'PARTIAL', missingDomains: [], staleDomains: [] },
        sourceVersions: [],
      },
      tripOntologyFacts: vehicleFacts,
      ontologyConstraints: {
        blockerCount: 1,
        warningCount: 0,
        missingEvidenceCount: 0,
        codes: ['VEHICLE_CAPABILITY_MISMATCH'],
      },
    } as unknown as TripContextSnapshotView;

    const issues = projectOntologyIssuesFromTripView(view);
    expect(issues.length).toBeGreaterThan(0);
  });
});
