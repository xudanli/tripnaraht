/**
 * Ontology HARD BLOCK must not use stale road/weather TravelWorldFacts alone.
 * Semi-static facts (visa, vehicle capability, …) stay evaluable.
 */

import type { TravelWorldFact } from '../../travel-ontology/contracts/travel-world-fact.types';
import {
  assessTravelWorldFactStale,
  ROAD_FACT_TTL_MS,
  WEATHER_FACT_TTL_MS,
  type FactStaleAssessment,
} from '../world-state/travel-world-fact-stale.util';
import { assertVectorMustNotHardBlock } from '../semantic/vector-hard-block.guard.util';

export type OntologyHardBlockFactSelection = {
  eligible: TravelWorldFact[];
  excluded: FactStaleAssessment[];
  vectorHardBlockBanned: true;
};

function isDynamicRoadOrWeatherFact(fact: TravelWorldFact, assessment: FactStaleAssessment): boolean {
  const p = fact.predicate ?? '';
  if (assessment.ttlMs === ROAD_FACT_TTL_MS || assessment.ttlMs === WEATHER_FACT_TTL_MS) {
    return true;
  }
  return (
    p.includes('road') ||
    p.includes('Road') ||
    p.includes('weather') ||
    p === 'route.currentRoadStatus'
  );
}

/**
 * Select facts eligible for Ontology/Gate HARD BLOCK evaluation.
 * Only stale **road/weather** facts are excluded; other domains keep evaluating.
 */
export function selectFactsForOntologyHardBlock(
  facts: TravelWorldFact[],
  nowMs = Date.now(),
): OntologyHardBlockFactSelection {
  assertVectorMustNotHardBlock({
    consumer: 'Constraint',
    proposedRole: 'EVIDENCE_DISCOVERY',
  });

  const eligible: TravelWorldFact[] = [];
  const excluded: FactStaleAssessment[] = [];

  for (const f of facts) {
    const a = assessTravelWorldFactStale(f, nowMs);
    if (a.excludeFromHardBlock && isDynamicRoadOrWeatherFact(f, a)) {
      excluded.push(a);
      continue;
    }
    eligible.push(f);
  }

  return { eligible, excluded, vectorHardBlockBanned: true };
}
