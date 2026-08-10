import type { ConstraintAssessment } from '../contracts/constraint-assessment.types';
import type { OntologyOutcomeEventV1 } from './ontology-outcome-reevaluation.util';

const eventsByTrip = new Map<string, OntologyOutcomeEventV1[]>();
const assessmentsByTrip = new Map<string, ConstraintAssessment[]>();

export function resetOntologyOutcomeStoresForTests(): void {
  eventsByTrip.clear();
  assessmentsByTrip.clear();
}

export function persistOntologyOutcomeEvent(
  tripId: string,
  event: OntologyOutcomeEventV1,
): void {
  const list = eventsByTrip.get(tripId) ?? [];
  list.push(event);
  eventsByTrip.set(tripId, list.slice(-100));
}

export function listOntologyOutcomeEvents(tripId: string): OntologyOutcomeEventV1[] {
  return [...(eventsByTrip.get(tripId) ?? [])];
}

export function upsertTripAssessments(
  tripId: string,
  assessments: ConstraintAssessment[],
): void {
  assessmentsByTrip.set(tripId, assessments);
}

export function getActiveTripAssessments(tripId: string): ConstraintAssessment[] {
  return (assessmentsByTrip.get(tripId) ?? []).filter(
    (a) =>
      !a.invalidated &&
      a.lifecycleStatus !== 'INVALIDATED' &&
      a.lifecycleStatus !== 'SUPERSEDED' &&
      a.lifecycleStatus !== 'EXPIRED',
  );
}

export function getLatestOntologyOutcomeEvent(
  tripId: string,
): OntologyOutcomeEventV1 | undefined {
  const list = eventsByTrip.get(tripId) ?? [];
  return list[list.length - 1];
}
