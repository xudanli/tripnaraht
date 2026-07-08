import type { TripContextSnapshotView } from '../../decision-runtime/snapshot/contracts/trip-context-snapshot.types';
import type { WorldFact } from '../../travel-context/domain/travel-context.types';
import type { TravelWorldFact } from '../contracts/travel-world-fact.types';
import { projectTravelWorldFactsToSnapshot } from '../contracts/world-fact-to-snapshot.adapter';
import { canonicalWorldStateToTravelWorldFacts } from './canonical-world-state-to-ontology-facts.adapter';

function dedupeWorldFacts(facts: WorldFact[]): WorldFact[] {
  const seen = new Set<string>();
  return facts.filter((f) => {
    if (seen.has(f.factId)) return false;
    seen.add(f.factId);
    return true;
  });
}

/**
 * 合并 Canonical World State 投影 + Trip DB Ontology 事实，输出 RFC-003 WorldFact[]。
 */
export function buildTripContextWorldFacts(t: TripContextSnapshotView): WorldFact[] {
  const observedAt = t.createdAt;
  const fromCanonical = projectTravelWorldFactsToSnapshot(
    canonicalWorldStateToTravelWorldFacts(t.worldFacts),
  );
  const fromTripOntology = projectTravelWorldFactsToSnapshot(t.tripOntologyFacts ?? []);

  const merged = dedupeWorldFacts([...fromTripOntology, ...fromCanonical]);

  if (merged.length === 0) {
    const legacyWeather = (t.worldFacts as unknown as Record<string, unknown>).weather;
    if (legacyWeather && typeof legacyWeather === 'object') {
      merged.push({
        factId: `world_weather_${t.tripId}`,
        type: 'weather.summary',
        kind: 'EXTERNAL_OBSERVED',
        value: legacyWeather,
        observedAt,
        sourceId: 'world_state_snapshot',
        authorityLevel: 'OFFICIAL_OPERATOR',
        confidence: t.bindings.dataCompletenessScore,
      });
    }
  }

  return merged;
}

/** 合并后的 Ontology 事实（Canonical + Trip DB），供 Constraint Gateway / Harness 使用 */
export function collectTripOntologyFacts(t: TripContextSnapshotView): TravelWorldFact[] {
  return [
    ...canonicalWorldStateToTravelWorldFacts(t.worldFacts),
    ...(t.tripOntologyFacts ?? []),
  ];
}
