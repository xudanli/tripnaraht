import { evaluateOntologyConstraints } from '../../travel-ontology/evaluators/ontology-constraint.evaluator';
import { projectExplorationRentalContractFacts } from '../../travel-ontology/adapters/exploration-rental-contract.adapter';
import { parseTravelWorldFactsFromSnapshot } from '../../travel-ontology/adapters/snapshot-world-fact.adapter';
import { projectTravelWorldFactsToSnapshot } from '../../travel-ontology/contracts';
import type { TravelWorldFact } from '../../travel-ontology/contracts/travel-world-fact.types';

describe('Exploration rental contract harness (ONT-SCENARIO-005 alignment)', () => {
  it('late pickup + unconfirmed after-hours → pickup window conflict', () => {
    const drafts = projectExplorationRentalContractFacts({
      destinationCodes: ['IS'],
      dateRange: { startDate: '2026-08-01', endDate: '2026-08-05' },
      travelers: [{ type: 'ADULT' }],
      mobilityContext: { vehicleType: '4WD_SUV' },
      rentalContext: { pickupTimeLocal: '23:30', afterHoursPickupConfirmed: false },
      source: 'USER_CREATED',
    });

    const facts: TravelWorldFact[] = drafts.map((d, i) => ({
      schemaId: 'tripnara.travel_world_fact@v1',
      factId: `draft_${i}`,
      subjectType: d.subjectType,
      subjectId: d.subjectId,
      predicate: d.predicate,
      value: d.payload,
      scope: { tripId: 'trip_1' },
      authorityLevel: 'USER_DECLARATION',
      source: { provider: d.sourceRef },
      observedAt: '2026-07-05T10:00:00.000Z',
      confidence: d.confidence,
      freshness: 'FRESH',
      verificationStatus: 'UNVERIFIED',
    }));

    const { results } = evaluateOntologyConstraints(facts);
    expect(results.some((r) => r.code === 'RENTAL_PICKUP_WINDOW_CONFLICT')).toBe(true);
    expect(results.some((r) => r.code === 'AFTER_HOURS_PICKUP_UNCONFIRMED')).toBe(true);
  });

  it('projects drafts to snapshot world facts roundtrip', () => {
    const drafts = projectExplorationRentalContractFacts({
      destinationCodes: ['IS'],
      dateRange: { startDate: '2026-09-10', endDate: '2026-09-18' },
      travelers: [{ type: 'ADULT' }],
      mobilityContext: { vehicleType: '2WD_COMPACT_SUV' },
      source: 'USER_CREATED',
    });

    const ontologyFacts: TravelWorldFact[] = drafts.map((d, i) => ({
      schemaId: 'tripnara.travel_world_fact@v1',
      factId: `draft_${i}`,
      subjectType: d.subjectType,
      subjectId: d.subjectId,
      predicate: d.predicate,
      value: d.payload,
      scope: { tripId: 'trip_1' },
      authorityLevel: 'SUPPLIER_CONTRACT',
      source: { provider: d.sourceRef },
      observedAt: '2026-07-05T10:00:00.000Z',
      confidence: d.confidence,
      freshness: 'FRESH',
      verificationStatus: 'UNVERIFIED',
    }));

    const snapshotFacts = projectTravelWorldFactsToSnapshot(ontologyFacts);
    const parsed = parseTravelWorldFactsFromSnapshot(snapshotFacts);
    expect(parsed.some((f) => f.predicate === 'rental.counterHours')).toBe(true);
  });
});
