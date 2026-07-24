/**
 * 构建 Ontology Harness 场景用 TravelWorldFact
 */

import {
  TRAVEL_WORLD_FACT_SCHEMA_ID,
  TRAVEL_WORLD_PREDICATES,
  type TravelWorldFact,
} from '../../../../travel-ontology/contracts';

let factCounter = 0;

export function buildOntologyFact<T>(
  partial: Omit<TravelWorldFact<T>, 'schemaId' | 'factId'> & { factId?: string },
): TravelWorldFact<T> {
  factCounter += 1;
  return {
    schemaId: TRAVEL_WORLD_FACT_SCHEMA_ID,
    factId: partial.factId ?? `fact_ontology_${factCounter}`,
    ...partial,
  };
}

export function resetOntologyFactCounter(): void {
  factCounter = 0;
}

export { TRAVEL_WORLD_PREDICATES };
