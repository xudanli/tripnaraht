/**
 * Travel Ontology 约束 → Canonical ConstraintAssertion
 */

import { randomUUID } from 'crypto';
import type { ConstraintAssertion } from '../../decision-runtime/constraints/contracts/constraint-assertion';
import type { WorldFact } from '../../travel-context/domain/travel-context.types';
import { parseTravelWorldFactsFromSnapshot } from '../adapters/snapshot-world-fact.adapter';
import {
  evaluateOntologyConstraints,
  ONTOLOGY_CONSTRAINT_EVALUATOR,
} from '../evaluators/ontology-constraint.evaluator';
import type { OntologyConstraintResult, OntologyConstraintSeverity } from '../evaluators/ontology-constraint.types';
import type { TravelWorldFact } from '../contracts/travel-world-fact.types';

function mapSeverity(severity: OntologyConstraintSeverity): ConstraintAssertion['status'] {
  switch (severity) {
    case 'BLOCK':
      return 'BLOCK';
    case 'WARNING':
      return 'WARNING';
    case 'MISSING_EVIDENCE':
      return 'REQUIRES_VERIFICATION';
    default:
      return 'PASS';
  }
}

function mapAssertionSeverity(severity: OntologyConstraintSeverity): ConstraintAssertion['severity'] {
  switch (severity) {
    case 'BLOCK':
      return 'CRITICAL';
    case 'WARNING':
      return 'HIGH';
    case 'MISSING_EVIDENCE':
      return 'MEDIUM';
    default:
      return 'INFO';
  }
}

export function ontologyResultToConstraintAssertion(
  tripId: string,
  result: OntologyConstraintResult,
): ConstraintAssertion {
  return {
    assertionId: `ont_${randomUUID()}`,
    constraintType: 'TRAVEL_ONTOLOGY',
    status: mapSeverity(result.severity),
    severity: mapAssertionSeverity(result.severity),
    scope: {
      tripId,
      roadSegmentIds: result.affectedSubjectIds,
    },
    reasonCode: result.code,
    evidenceRefs: [],
    message: result.message,
    evaluator: ONTOLOGY_CONSTRAINT_EVALUATOR,
    overridable: result.severity !== 'BLOCK',
  };
}

export function evaluateOntologyConstraintAssertions(input: {
  tripId: string;
  travelWorldFacts?: TravelWorldFact[];
  snapshotWorldFacts?: WorldFact[];
}): ConstraintAssertion[] {
  const facts =
    input.travelWorldFacts ??
    (input.snapshotWorldFacts ? parseTravelWorldFactsFromSnapshot(input.snapshotWorldFacts) : []);

  if (facts.length === 0) return [];

  const evaluation = evaluateOntologyConstraints(facts);
  return evaluation.results.map((r) => ontologyResultToConstraintAssertion(input.tripId, r));
}
