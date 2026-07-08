/**
 * Ontology Constraint Provider — Gateway 接入
 */

import { Injectable } from '@nestjs/common';
import type { ConstraintAssertion } from '../contracts/constraint-assertion';
import { evaluateOntologyConstraintAssertions } from '../../../travel-ontology/providers/ontology-constraint.provider';
import type { WorldFact } from '../../../travel-context/domain/travel-context.types';
import type { TravelWorldFact } from '../../../travel-ontology/contracts/travel-world-fact.types';

@Injectable()
export class OntologyConstraintProvider {
  evaluate(input: {
    tripId: string;
    travelWorldFacts?: TravelWorldFact[];
    snapshotWorldFacts?: WorldFact[];
  }): ConstraintAssertion[] {
    return evaluateOntologyConstraintAssertions(input);
  }
}
